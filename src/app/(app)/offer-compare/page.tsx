"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Loader2, Calculator, Check, AlertTriangle, Award } from "lucide-react";
import { toast } from "sonner";

const BENEFIT_OPTIONS = [
  { value: "health", label: "Health" },
  { value: "dental", label: "Dental" },
  { value: "vision", label: "Vision" },
  { value: "401k_match", label: "401(k) match" },
  { value: "unlimited_pto", label: "Unlimited PTO" },
  { value: "paid_parental_leave", label: "Paid parental leave" },
  { value: "remote_stipend", label: "Remote stipend" },
  { value: "learning_budget", label: "Learning budget" },
  { value: "equity_refresh", label: "Equity refresh" },
];

interface VerdictResult {
  hasPrefs: boolean;
  message?: string;
  verdict?: "strong" | "good" | "borderline" | "weak";
  base?: number;
  bonus?: number;
  equity?: number;
  signOn?: number;
  totalAnnual?: number;
  deltaToTarget?: number | null;
  deltaToMin?: number | null;
  issues?: string[];
  wins?: string[];
  prefsSnapshot?: {
    currency: string;
    period: string;
    salaryMin: number | null;
    salaryTarget: number | null;
    salaryMax: number | null;
    hasHardFloor: boolean;
  };
}

const VERDICT_META: Record<NonNullable<VerdictResult["verdict"]>, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  strong:     { label: "Strong offer",  cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40", Icon: Award },
  good:       { label: "Solid offer",   cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/40",                 Icon: Check },
  borderline: { label: "Borderline",    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40",         Icon: AlertTriangle },
  weak:       { label: "Below your bar", cls: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/40",                Icon: AlertTriangle },
};

export default function OfferComparePage() {
  const [base, setBase] = useState("");
  const [bonus, setBonus] = useState("");
  const [equity, setEquity] = useState("");
  const [signOn, setSignOn] = useState("");
  const [workMode, setWorkMode] = useState<string>("any");
  const [employmentType, setEmploymentType] = useState<string>("full_time");
  const [benefits, setBenefits] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerdictResult | null>(null);

  const toggle = (v: string) =>
    setBenefits((b) => (b.includes(v) ? b.filter((x) => x !== v) : [...b, v]));

  async function compare() {
    if (!base) {
      toast.error("Enter a base salary");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/offer-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base: Number(base),
          bonus: bonus ? Number(bonus) : 0,
          equity: equity ? Number(equity) : 0,
          signOn: signOn ? Number(signOn) : 0,
          workMode,
          employmentType,
          benefits,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to compare offer");
    } finally {
      setLoading(false);
    }
  }

  function fmt(n: number, currency = "USD"): string {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${currency} ${n.toLocaleString()}`;
    }
  }

  const verdictMeta = result?.verdict ? VERDICT_META[result.verdict] : null;

  return (
    <div className="container max-w-3xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-emerald-600" />
          Offer Compare
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste an incoming offer and see how it stacks up against your saved compensation expectations.
          Nothing is saved or shared — this is just a calculator.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            The offer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="mb-1 text-xs">Base / yr</Label>
              <Input type="number" placeholder="160000" value={base} onChange={(e) => setBase(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 text-xs">Annual bonus</Label>
              <Input type="number" placeholder="20000" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 text-xs">Equity / yr</Label>
              <Input type="number" placeholder="40000" value={equity} onChange={(e) => setEquity(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 text-xs">Sign-on</Label>
              <Input type="number" placeholder="10000" value={signOn} onChange={(e) => setSignOn(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 text-xs">Work mode</Label>
              <Select value={workMode} onValueChange={(v) => setWorkMode(v ?? "any")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Unspecified</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="onsite">On-site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 text-xs">Employment type</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v ?? "full_time")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="1099">1099</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs">Benefits offered</Label>
            <div className="flex flex-wrap gap-1.5">
              {BENEFIT_OPTIONS.map((opt) => {
                const on = benefits.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
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

          <div>
            <Label className="mb-1 text-xs">Notes (recruiter, role, anything to remember)</Label>
            <Textarea
              rows={2}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={compare} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
              Score this offer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Verdict */}
      {result && !result.hasPrefs && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {result.message ?? "Set your compensation expectations first."}
          </CardContent>
        </Card>
      )}

      {result && result.hasPrefs && verdictMeta && (
        <Card className={verdictMeta.cls + " border-2"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <verdictMeta.Icon className="h-5 w-5" />
              {verdictMeta.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Total package / yr</div>
                <div className="text-xl font-semibold">{fmt(result.totalAnnual ?? 0, result.prefsSnapshot?.currency)}</div>
              </div>
              {result.deltaToTarget != null && (
                <div>
                  <div className="text-xs text-muted-foreground">vs. your target</div>
                  <div className={`text-xl font-semibold ${result.deltaToTarget >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {result.deltaToTarget >= 0 ? "+" : "−"}{fmt(Math.abs(result.deltaToTarget), result.prefsSnapshot?.currency)}
                  </div>
                </div>
              )}
              {result.deltaToMin != null && (
                <div>
                  <div className="text-xs text-muted-foreground">vs. your minimum</div>
                  <div className={`text-xl font-semibold ${result.deltaToMin >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                    {result.deltaToMin >= 0 ? "+" : "−"}{fmt(Math.abs(result.deltaToMin), result.prefsSnapshot?.currency)}
                  </div>
                </div>
              )}
            </div>

            {result.wins && result.wins.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1">Strengths</div>
                <ul className="space-y-1 text-sm">
                  {result.wins.map((w, i) => (
                    <li key={i} className="flex items-start gap-2"><Check className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.issues && result.issues.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">Things to negotiate</div>
                <ul className="space-y-1 text-sm">
                  {result.issues.map((s, i) => (
                    <li key={i} className="flex items-start gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

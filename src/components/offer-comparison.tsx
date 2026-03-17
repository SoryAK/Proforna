"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Briefcase,
  TrendingUp,
  Wallet,
  Check,
  X,
  Scale,
} from "lucide-react";

/* ── Types ── */

interface OfferForm {
  offerPayType: string;
  offerPayRate: string;
  offerSalary: string;
  offerPayFrequency: string;
  offerHoursPerWeek: string;
  offerOtHours: string;
  offerOtRate: string;
  offerSigningBonus: string;
  offerAnnualBonus: string;
  offerEquity: string;
  offer401kMatch: string;
  offerPtoDays: string;
  offerHealthCost: string;
  offerNotes: string;
}

interface MonthlyExpenses {
  rent: string; utilities: string; car: string; carInsurance: string;
  phone: string; subscriptions: string; groceries: string; gas: string;
  studentLoans: string; creditCards: string; otherDebt: string;
  savings: string; otherExpenses: string;
}

interface Profile {
  filingStatus: string;
  federalTaxRate: number | null;
  stateTaxRate: number | null;
  monthlyExpenses: string | null;
}

interface Position {
  id: string;
  company: string;
  role: string;
  salary: number | null;
  payRate: string | null;
  payType: string;
  payFrequency: string;
  hoursPerWeek: number | null;
  scheduleBHours: number | null;
  rotatingSchedule: boolean;
  otHoursA: number | null;
  otHoursB: number | null;
  otRate: number | null;
  differentials: string | null;
  estimatorSettings: string | null;
  isActive: boolean;
}

interface CompEvent {
  type: string;
  amount: number;
  recurring: boolean;
  effectiveDate: string;
}

interface Application {
  id: string;
  company: string;
  role: string;
  offerPayType: string | null;
  offerPayRate: string | null;
  offerSalary: number | null;
  offerPayFrequency: string | null;
  offerHoursPerWeek: number | null;
  offerOtHours: number | null;
  offerOtRate: number | null;
  offerSigningBonus: number | null;
  offerAnnualBonus: number | null;
  offerEquity: string | null;
  offer401kMatch: number | null;
  offerPtoDays: number | null;
  offerHealthCost: number | null;
  offerNotes: string | null;
}

interface Props {
  application: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyOfferForm: OfferForm = {
  offerPayType: "salary",
  offerPayRate: "",
  offerSalary: "",
  offerPayFrequency: "biweekly",
  offerHoursPerWeek: "40",
  offerOtHours: "0",
  offerOtRate: "1.5",
  offerSigningBonus: "",
  offerAnnualBonus: "",
  offerEquity: "",
  offer401kMatch: "",
  offerPtoDays: "",
  offerHealthCost: "",
  offerNotes: "",
};

/* ── Helper: compute gross annual from pay params ── */

function computeGrossAnnual(p: {
  payType: string;
  payRate: number;
  salary: number;
  hoursPerWeek: number;
  otHours: number;
  otRate: number;
  annualBonus: number;
}) {
  if (p.payType === "hourly" && p.payRate > 0) {
    const regHrs = Math.min(p.hoursPerWeek, 40);
    const base = p.payRate * regHrs * 52;
    const ot = p.payRate * p.otRate * p.otHours * 52;
    return base + ot + p.annualBonus;
  }
  return p.salary + p.annualBonus;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/* ── Component ── */

export function OfferComparison({ application, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OfferForm>(emptyOfferForm);
  const [saving, setSaving] = useState(false);

  // Fetch profile (expenses + tax rates)
  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then(r => r.json()),
  });

  // Fetch current active position
  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["current-position"],
    queryFn: () => fetch("/api/current-position").then(r => r.json()),
  });
  const currentPos = positions.find(p => p.isActive);

  // Fetch compensation events for current position
  const { data: compEvents = [] } = useQuery<CompEvent[]>({
    queryKey: ["compensation", currentPos?.id],
    queryFn: () => currentPos ? fetch(`/api/compensation?positionId=${currentPos.id}`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!currentPos,
  });

  // Hydrate form from saved application offer data
  useEffect(() => {
    if (!application) return;
    setForm({
      offerPayType: application.offerPayType || "salary",
      offerPayRate: application.offerPayRate || "",
      offerSalary: application.offerSalary?.toString() || "",
      offerPayFrequency: application.offerPayFrequency || "biweekly",
      offerHoursPerWeek: application.offerHoursPerWeek?.toString() || "40",
      offerOtHours: application.offerOtHours?.toString() || "0",
      offerOtRate: application.offerOtRate?.toString() || "1.5",
      offerSigningBonus: application.offerSigningBonus?.toString() || "",
      offerAnnualBonus: application.offerAnnualBonus?.toString() || "",
      offerEquity: application.offerEquity || "",
      offer401kMatch: application.offer401kMatch?.toString() || "",
      offerPtoDays: application.offerPtoDays?.toString() || "",
      offerHealthCost: application.offerHealthCost?.toString() || "",
      offerNotes: application.offerNotes || "",
    });
  }, [application]);

  const saveOffer = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        offerPayType: form.offerPayType,
        offerPayRate: form.offerPayRate || null,
        offerSalary: form.offerSalary ? parseInt(form.offerSalary) : null,
        offerPayFrequency: form.offerPayFrequency,
        offerHoursPerWeek: form.offerHoursPerWeek ? parseFloat(form.offerHoursPerWeek) : null,
        offerOtHours: form.offerOtHours ? parseFloat(form.offerOtHours) : null,
        offerOtRate: form.offerOtRate ? parseFloat(form.offerOtRate) : null,
        offerSigningBonus: form.offerSigningBonus ? parseInt(form.offerSigningBonus) : null,
        offerAnnualBonus: form.offerAnnualBonus ? parseInt(form.offerAnnualBonus) : null,
        offerEquity: form.offerEquity || null,
        offer401kMatch: form.offer401kMatch ? parseFloat(form.offer401kMatch) : null,
        offerPtoDays: form.offerPtoDays ? parseInt(form.offerPtoDays) : null,
        offerHealthCost: form.offerHealthCost ? parseFloat(form.offerHealthCost) : null,
        offerNotes: form.offerNotes || null,
      };
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to save");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Offer details saved");
    } catch {
      toast.error("Failed to save offer");
    } finally {
      setSaving(false);
    }
  }, [application.id, form, queryClient]);

  /* ── Current position income ── */

  const curBaseRate = currentPos?.payRate ? parseFloat(currentPos.payRate.replace(/[^0-9.]/g, "")) : 0;
  const curEstSettings: Record<string, string> = (() => {
    try { return currentPos?.estimatorSettings ? JSON.parse(currentPos.estimatorSettings) : {}; } catch { return {}; }
  })();

  const curGross = currentPos ? (() => {
    if (currentPos.payType === "hourly" && curBaseRate > 0) {
      const hrsA = currentPos.hoursPerWeek || 40;
      const hrsB = currentPos.scheduleBHours || 40;
      const ot1A = currentPos.otHoursA || 0;
      const ot1B = currentPos.otHoursB || 0;
      const ot1Mult = currentPos.otRate || 1.5;
      const weeks = 52;
      let base: number, ot: number;
      if (currentPos.rotatingSchedule) {
        const half = weeks / 2;
        base = curBaseRate * (hrsA * half + hrsB * half);
        ot = curBaseRate * ot1Mult * (ot1A * half + ot1B * half);
      } else {
        base = curBaseRate * hrsA * weeks;
        ot = curBaseRate * ot1Mult * ot1A * weeks;
      }
      const bonuses = compEvents.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0);
      return base + ot + bonuses;
    }
    const base = currentPos.salary || compEvents.filter(e => e.recurring).sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0]?.amount || 0;
    const bonuses = compEvents.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0);
    return base + bonuses;
  })() : 0;

  /* ── Offer income ── */

  const offerRate = parseFloat(form.offerPayRate.replace(/[^0-9.]/g, "")) || 0;
  const offerSal = parseFloat(form.offerSalary) || 0;
  const offerHrs = parseFloat(form.offerHoursPerWeek) || 40;
  const offerOt = parseFloat(form.offerOtHours) || 0;
  const offerOtMult = parseFloat(form.offerOtRate) || 1.5;
  const offerBonus = parseFloat(form.offerAnnualBonus) || 0;
  const offerSigning = parseFloat(form.offerSigningBonus) || 0;

  const offerGross = computeGrossAnnual({
    payType: form.offerPayType,
    payRate: offerRate,
    salary: offerSal,
    hoursPerWeek: offerHrs,
    otHours: offerOt,
    otRate: offerOtMult,
    annualBonus: offerBonus,
  });

  /* ── Tax / deductions (from profile) ── */

  const fedPct = profile?.federalTaxRate ?? parseFloat(curEstSettings.estFederalTax || "22");
  const statePct = profile?.stateTaxRate ?? parseFloat(curEstSettings.estStateTax || "5");
  const retPct = parseFloat(curEstSettings.estRetirement || "0");
  const healthInsPer = parseFloat(curEstSettings.estHealthIns || "0");
  const otherDedPer = parseFloat(curEstSettings.estOtherDed || "0");

  const curPayPeriods = currentPos ? (currentPos.payFrequency === "weekly" ? 52 : currentPos.payFrequency === "biweekly" ? 26 : currentPos.payFrequency === "semimonthly" ? 24 : 12) : 26;
  const offerPayPeriods = form.offerPayFrequency === "weekly" ? 52 : form.offerPayFrequency === "biweekly" ? 26 : form.offerPayFrequency === "semimonthly" ? 24 : 12;

  // Current net monthly
  const curGrossMonthly = curGross / 12;
  const curTaxMonthly = curGrossMonthly * (fedPct + statePct) / 100;
  const curRetMonthly = curGrossMonthly * retPct / 100;
  const curHealthMonthly = healthInsPer * (curPayPeriods / 12);
  const curOtherMonthly = otherDedPer * (curPayPeriods / 12);
  const curNetMonthly = curGrossMonthly - curTaxMonthly - curRetMonthly - curHealthMonthly - curOtherMonthly;

  // Offer net monthly (health cost might differ)
  const offerGrossMonthly = offerGross / 12;
  const offerTaxMonthly = offerGrossMonthly * (fedPct + statePct) / 100;
  const offerRetMonthly = offerGrossMonthly * retPct / 100;
  const offerHealthMonthly = form.offerHealthCost ? parseFloat(form.offerHealthCost) : curHealthMonthly;
  const offerOtherMonthly = curOtherMonthly; // assume same unless changed
  const offerNetMonthly = offerGrossMonthly - offerTaxMonthly - offerRetMonthly - offerHealthMonthly - offerOtherMonthly;

  // Expenses from profile
  const expenses: MonthlyExpenses = (() => {
    try { return profile?.monthlyExpenses ? JSON.parse(profile.monthlyExpenses) : {}; } catch { return {}; }
  })();
  const totalExpenses = Object.values(expenses).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  const curLeftOver = curNetMonthly - totalExpenses;
  const offerLeftOver = offerNetMonthly - totalExpenses;
  const monthlyDiff = offerLeftOver - curLeftOver;
  const annualDiff = offerGross - curGross;

  // Comparison helper
  const DiffBadge = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
    if (Math.abs(value) < 1) return <Badge variant="secondary" className="text-xs"><Minus className="h-3 w-3 mr-0.5" />Same</Badge>;
    return value > 0
      ? <Badge className="text-xs bg-emerald-100 text-emerald-700"><ArrowUpRight className="h-3 w-3 mr-0.5" />+${fmt(value)}{suffix}</Badge>
      : <Badge className="text-xs bg-red-100 text-red-700"><ArrowDownRight className="h-3 w-3 mr-0.5" />-${fmt(Math.abs(value))}{suffix}</Badge>;
  };

  const hasOfferData = offerGross > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Compare Offer — {application.company}, {application.role}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Offer Details Form ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Offer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs mb-1">Pay Type</Label>
                  <Select value={form.offerPayType} onValueChange={v => setForm({ ...form, offerPayType: v ?? "salary" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salary">Salary</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.offerPayType === "salary" ? (
                  <div className="sm:col-span-2">
                    <Label className="text-xs mb-1">Annual Salary</Label>
                    <Input type="number" placeholder="75000" value={form.offerSalary} onChange={e => setForm({ ...form, offerSalary: e.target.value })} />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs mb-1">Hourly Rate</Label>
                      <Input placeholder="$35.50" value={form.offerPayRate} onChange={e => setForm({ ...form, offerPayRate: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1">Hours / Week</Label>
                      <Input type="number" placeholder="40" value={form.offerHoursPerWeek} onChange={e => setForm({ ...form, offerHoursPerWeek: e.target.value })} />
                    </div>
                  </>
                )}
              </div>

              {form.offerPayType === "hourly" && parseFloat(form.offerHoursPerWeek) > 40 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs mb-1">OT Hours / Week</Label>
                    <Input type="number" placeholder={`${parseFloat(form.offerHoursPerWeek) - 40}`} value={form.offerOtHours} onChange={e => setForm({ ...form, offerOtHours: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs mb-1">OT Multiplier</Label>
                    <Input type="number" step="0.1" placeholder="1.5" value={form.offerOtRate} onChange={e => setForm({ ...form, offerOtRate: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs mb-1">Pay Frequency</Label>
                  <Select value={form.offerPayFrequency} onValueChange={v => setForm({ ...form, offerPayFrequency: v ?? "biweekly" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Biweekly</SelectItem>
                      <SelectItem value="semimonthly">Semimonthly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1">Signing Bonus</Label>
                  <Input type="number" placeholder="0" value={form.offerSigningBonus} onChange={e => setForm({ ...form, offerSigningBonus: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Annual Bonus</Label>
                  <Input type="number" placeholder="0" value={form.offerAnnualBonus} onChange={e => setForm({ ...form, offerAnnualBonus: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs mb-1">Equity / RSU</Label>
                  <Input placeholder="5000 shares / 4 yrs" value={form.offerEquity} onChange={e => setForm({ ...form, offerEquity: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1">401k Match %</Label>
                  <Input type="number" step="0.5" placeholder="6" value={form.offer401kMatch} onChange={e => setForm({ ...form, offer401kMatch: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1">PTO Days / Year</Label>
                  <Input type="number" placeholder="15" value={form.offerPtoDays} onChange={e => setForm({ ...form, offerPtoDays: e.target.value })} />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1">Monthly Health Insurance Cost (your share)</Label>
                <Input type="number" placeholder="Leave blank to use current" value={form.offerHealthCost} onChange={e => setForm({ ...form, offerHealthCost: e.target.value })} />
              </div>

              <div className="flex justify-end">
                <Button onClick={saveOffer} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save Offer Details"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Side-by-Side Comparison ── */}
          {hasOfferData && currentPos && (
            <>
              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className={annualDiff > 0 ? "border-emerald-200 dark:border-emerald-800" : annualDiff < 0 ? "border-red-200 dark:border-red-800" : ""}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Annual Difference</p>
                    <DiffBadge value={annualDiff} suffix="/yr" />
                  </CardContent>
                </Card>
                <Card className={monthlyDiff > 0 ? "border-emerald-200 dark:border-emerald-800" : monthlyDiff < 0 ? "border-red-200 dark:border-red-800" : ""}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Monthly After Expenses</p>
                    <DiffBadge value={monthlyDiff} suffix="/mo" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Year-1 Value</p>
                    <p className="text-sm font-mono font-bold">${fmt(offerGross + offerSigning)}</p>
                    <p className="text-xs text-muted-foreground">incl signing bonus</p>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed comparison table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Detailed Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {/* Header */}
                    <div className="text-muted-foreground font-medium" />
                    <div className="text-center font-medium flex items-center justify-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      Current
                    </div>
                    <div className="text-center font-medium flex items-center justify-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Offer
                    </div>

                    <Separator className="col-span-3" />

                    {/* Gross Annual */}
                    <div className="text-muted-foreground">Gross Annual</div>
                    <div className="text-center font-mono">${fmt(curGross)}</div>
                    <div className="text-center font-mono">${fmt(offerGross)}</div>

                    {/* Gross Monthly */}
                    <div className="text-muted-foreground">Gross Monthly</div>
                    <div className="text-center font-mono">${fmt(curGrossMonthly)}</div>
                    <div className="text-center font-mono">${fmt(offerGrossMonthly)}</div>

                    <Separator className="col-span-3" />

                    {/* Taxes */}
                    <div className="text-muted-foreground">Taxes / mo</div>
                    <div className="text-center font-mono text-red-600">-${fmt(curTaxMonthly)}</div>
                    <div className="text-center font-mono text-red-600">-${fmt(offerTaxMonthly)}</div>

                    {/* Retirement */}
                    {retPct > 0 && (
                      <>
                        <div className="text-muted-foreground">Retirement / mo</div>
                        <div className="text-center font-mono text-amber-600">-${fmt(curRetMonthly)}</div>
                        <div className="text-center font-mono text-amber-600">-${fmt(offerRetMonthly)}</div>
                      </>
                    )}

                    {/* Health */}
                    <div className="text-muted-foreground">Health Ins / mo</div>
                    <div className="text-center font-mono text-amber-600">-${fmt(curHealthMonthly)}</div>
                    <div className="text-center font-mono text-amber-600">-${fmt(offerHealthMonthly)}</div>

                    <Separator className="col-span-3" />

                    {/* Net Monthly */}
                    <div className="font-medium">Net Monthly</div>
                    <div className="text-center font-mono font-medium text-emerald-600">${fmt(curNetMonthly)}</div>
                    <div className="text-center font-mono font-medium text-emerald-600">${fmt(offerNetMonthly)}</div>

                    {/* Expenses */}
                    {totalExpenses > 0 && (
                      <>
                        <div className="text-muted-foreground">Expenses / mo</div>
                        <div className="text-center font-mono text-orange-600">-${fmt(totalExpenses)}</div>
                        <div className="text-center font-mono text-orange-600">-${fmt(totalExpenses)}</div>
                      </>
                    )}

                    <Separator className="col-span-3" />

                    {/* Left Over */}
                    <div className="font-medium">Left Over / mo</div>
                    <div className={`text-center font-mono font-bold ${curLeftOver >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {curLeftOver < 0 ? "-" : ""}${fmt(Math.abs(curLeftOver))}
                    </div>
                    <div className={`text-center font-mono font-bold ${offerLeftOver >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {offerLeftOver < 0 ? "-" : ""}${fmt(Math.abs(offerLeftOver))}
                    </div>

                    {/* Perks comparison */}
                    {(form.offer401kMatch || form.offerPtoDays || form.offerEquity) && (
                      <>
                        <Separator className="col-span-3 my-1" />
                        <div className="col-span-3 text-xs font-medium text-muted-foreground uppercase tracking-wider pt-1">Perks</div>

                        {form.offer401kMatch && (
                          <>
                            <div className="text-muted-foreground">401k Match</div>
                            <div className="text-center text-muted-foreground">—</div>
                            <div className="text-center">{form.offer401kMatch}%</div>
                          </>
                        )}
                        {form.offerPtoDays && (
                          <>
                            <div className="text-muted-foreground">PTO Days</div>
                            <div className="text-center text-muted-foreground">—</div>
                            <div className="text-center">{form.offerPtoDays} days</div>
                          </>
                        )}
                        {form.offerEquity && (
                          <>
                            <div className="text-muted-foreground">Equity</div>
                            <div className="text-center text-muted-foreground">—</div>
                            <div className="text-center text-xs">{form.offerEquity}</div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Verdict */}
              <Card className={monthlyDiff > 0 ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800" : monthlyDiff < 0 ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${monthlyDiff > 0 ? "bg-emerald-100 text-emerald-700" : monthlyDiff < 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                      {monthlyDiff > 0 ? <Check className="h-4 w-4" /> : monthlyDiff < 0 ? <X className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {monthlyDiff > 200
                          ? `This offer puts an extra $${fmt(monthlyDiff)}/mo in your pocket after all expenses.`
                          : monthlyDiff > 0
                            ? `Slight improvement — $${fmt(monthlyDiff)}/mo more after expenses.`
                            : monthlyDiff > -200
                              ? `About the same take-home after expenses ($${fmt(Math.abs(monthlyDiff))}/mo less).`
                              : `You'd have $${fmt(Math.abs(monthlyDiff))}/mo less after expenses with this offer.`}
                      </p>
                      {offerSigning > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Plus a ${fmt(offerSigning)} signing bonus in year one.
                        </p>
                      )}
                      {totalExpenses === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Add your monthly expenses in the Finance tab for a complete picture.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* No current position */}
          {!currentPos && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <p>Add your current position first to compare against this offer.</p>
            </div>
          )}

          {/* Offer entered but no expenses */}
          {hasOfferData && currentPos && totalExpenses === 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <Wallet className="h-4 w-4 inline mr-1.5" />
                Tip: Add your monthly expenses in the <strong>Finance</strong> tab on your current position page. They&apos;ll automatically be used in all offer comparisons.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

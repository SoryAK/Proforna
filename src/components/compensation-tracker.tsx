"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Layers,
  Receipt,
  Upload,
  FileText,
  Loader2,
  Check,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";

interface CompEvent {
  id: string;
  positionId: string;
  type: string;
  title: string;
  amount: number;
  currency: string;
  effectiveDate: string;
  recurring: boolean;
  notes: string | null;
}

interface Props {
  positionId: string;
  payType: string;
  payRate: string | null;
  differentials: string | null;
  salary: number | null;
  schedule: string | null;
  payFrequency: string;
  rotatingSchedule: boolean;
  hoursPerWeek: number | null;
  scheduleBHours: number | null;
  otHoursA: number | null;
  otHoursB: number | null;
  otRate: number | null;
  annualRaiseMin: number | null;
  annualRaiseMax: number | null;
  estimatorSettings: string | null;
}

interface EstimatorSettings {
  estOt2Hours: string;
  estOt2Rate: string;
  estSchedBOt2: string;
  estDiffPercent: string;
  estHolidayDays: string;
  estHolidayRate: string;
  estFederalTax: string;
  estStateTax: string;
  estRetirement: string;
  estHealthIns: string;
  estOtherDed: string;
}

interface PaycheckData {
  grossPay: number | null;
  netPay: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  payRate: number | null;
  federalTax: number | null;
  stateTax: number | null;
  socialSecurity: number | null;
  medicare: number | null;
  retirement: number | null;
  healthInsurance: number | null;
  otherDeductions: number | null;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  percentages?: {
    federalTax: number | null;
    stateTax: number | null;
    socialSecurity: number | null;
    medicare: number | null;
    retirement: number | null;
    healthInsurance: number | null;
    totalDeductions: number | null;
  };
}

const COMP_TYPES = [
  { value: "base_salary", label: "Base Salary" },
  { value: "raise", label: "Raise" },
  { value: "bonus", label: "Bonus" },
  { value: "signing_bonus", label: "Signing Bonus" },
  { value: "equity", label: "Equity / RSU" },
  { value: "promotion", label: "Promotion" },
  { value: "stipend", label: "Stipend" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<string, string> = {
  base_salary: "bg-orange-100 text-orange-700",
  raise: "bg-green-100 text-green-700",
  bonus: "bg-amber-100 text-amber-700",
  signing_bonus: "bg-purple-100 text-purple-700",
  equity: "bg-indigo-100 text-indigo-700",
  promotion: "bg-emerald-100 text-emerald-700",
  stipend: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-700",
};

const emptyForm = {
  type: "base_salary",
  title: "",
  amount: "",
  currency: "USD",
  effectiveDate: "",
  recurring: false,
  notes: "",
};

export function CompensationTracker({ positionId, payType, payRate, differentials, salary, schedule, payFrequency, rotatingSchedule, hoursPerWeek, scheduleBHours, otHoursA, otHoursB, otRate, annualRaiseMin, annualRaiseMax, estimatorSettings }: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showEstimator, setShowEstimator] = useState(false);

  // Parse saved estimator settings
  const savedSettings: Partial<EstimatorSettings> = (() => {
    try { return estimatorSettings ? JSON.parse(estimatorSettings) : {}; }
    catch { return {}; }
  })();

  // Hours from position props (set in the position form)
  const estHoursPerWeek = hoursPerWeek?.toString() || "40";
  const estSchedBHours = scheduleBHours?.toString() || "40";

  // Primary OT from position props; OT2 tier from estimator settings
  const estOt1Hours = otHoursA?.toString() || "0";
  const estOt1Rate = otRate?.toString() || "1.5";
  const [estOt2Hours, setEstOt2Hours] = useState(savedSettings.estOt2Hours ?? "0");
  const [estOt2Rate, setEstOt2Rate] = useState(savedSettings.estOt2Rate ?? "2");
  const estSchedBOt1 = otHoursB?.toString() || "0";
  const [estSchedBOt2, setEstSchedBOt2] = useState(savedSettings.estSchedBOt2 ?? "0");
  const [estDiffPercent, setEstDiffPercent] = useState(savedSettings.estDiffPercent ?? "50");
  const [estHolidayDays, setEstHolidayDays] = useState(savedSettings.estHolidayDays ?? "0");
  const [estHolidayRate, setEstHolidayRate] = useState(savedSettings.estHolidayRate ?? "1.5");
  const [showTakeHome, setShowTakeHome] = useState(false);
  const [estFederalTax, setEstFederalTax] = useState(savedSettings.estFederalTax ?? "22");
  const [estStateTax, setEstStateTax] = useState(savedSettings.estStateTax ?? "5");
  const [estRetirement, setEstRetirement] = useState(savedSettings.estRetirement ?? "0");
  const [estHealthIns, setEstHealthIns] = useState(savedSettings.estHealthIns ?? "0");
  const [estOtherDed, setEstOtherDed] = useState(savedSettings.estOtherDed ?? "0");
  const [paycheckParsing, setPaycheckParsing] = useState(false);
  const [paycheckData, setPaycheckData] = useState<PaycheckData | null>(null);
  const [showPaycheckPreview, setShowPaycheckPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible section state
  const [sectionPay, setSectionPay] = useState(true);
  const [sectionEstimator, setSectionEstimator] = useState(true);
  const [sectionHistory, setSectionHistory] = useState(false);

  // Annual raise range state
  const [raiseMin, setRaiseMin] = useState(annualRaiseMin != null ? String(annualRaiseMin) : "");
  const [raiseMax, setRaiseMax] = useState(annualRaiseMax != null ? String(annualRaiseMax) : "");
  const raiseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRaiseRange = useCallback(() => {
    const min = raiseMin ? parseFloat(raiseMin) : null;
    const max = raiseMax ? parseFloat(raiseMax) : null;
    fetch(`/api/current-position/${positionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annualRaiseMin: min, annualRaiseMax: max }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
    });
  }, [positionId, raiseMin, raiseMax, queryClient]);

  useEffect(() => {
    if (raiseMin === (annualRaiseMin != null ? String(annualRaiseMin) : "") &&
        raiseMax === (annualRaiseMax != null ? String(annualRaiseMax) : "")) return;
    clearTimeout(raiseTimer.current);
    raiseTimer.current = setTimeout(saveRaiseRange, 800);
    return () => clearTimeout(raiseTimer.current);
  }, [raiseMin, raiseMax, saveRaiseRange, annualRaiseMin, annualRaiseMax]);

  // Auto-save estimator settings to the position (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveEstimatorSettings = useCallback(() => {
    const settings: EstimatorSettings = {
      estOt2Hours, estOt2Rate,
      estSchedBOt2, estDiffPercent,
      estHolidayDays, estHolidayRate, estFederalTax,
      estStateTax, estRetirement, estHealthIns, estOtherDed,
    };
    fetch(`/api/current-position/${positionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimatorSettings: JSON.stringify(settings) }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["current-position"] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
    });
  }, [positionId, estOt2Hours, estOt2Rate, estSchedBOt2, estDiffPercent, estHolidayDays, estHolidayRate, estFederalTax, estStateTax, estRetirement, estHealthIns, estOtherDed, queryClient]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      return;
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveEstimatorSettings, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [saveEstimatorSettings]);

  const { data: events = [] } = useQuery<CompEvent[]>({
    queryKey: ["compensation", positionId],
    queryFn: () =>
      fetch(`/api/compensation?positionId=${positionId}`).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/compensation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation", positionId] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Compensation added");
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/compensation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation", positionId] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Compensation updated");
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/compensation/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation", positionId] });
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Removed");
    },
  });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const openEdit = (ev: CompEvent) => {
    setForm({
      type: ev.type,
      title: ev.title,
      amount: ev.amount.toString(),
      currency: ev.currency,
      effectiveDate: format(new Date(ev.effectiveDate), "yyyy-MM-dd"),
      recurring: ev.recurring,
      notes: ev.notes || "",
    });
    setEditingId(ev.id);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      positionId,
      ...form,
      amount: parseInt(form.amount),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Calculate totals
  const currentSalary = events
    .filter((e) => e.recurring)
    .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0];
  const totalBonuses = events
    .filter((e) => !e.recurring)
    .reduce((sum, e) => sum + e.amount, 0);
  const currency = currentSalary?.currency || events[0]?.currency || "USD";

  // Parse differentials
  const diffItems = differentials?.split("\n").filter(Boolean) ?? [];

  // Parse base rate as a number (strip non-numeric except dots)
  const baseRateNum = payRate ? parseFloat(payRate.replace(/[^0-9.]/g, "")) : 0;

  // Parse differential amounts
  const parseDiffAmount = (d: string) => {
    const m = d.match(/[+-]?\$?([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  };

  // Yearly estimation calc
  const schedAHrs = parseFloat(estHoursPerWeek) || 0;
  const schedBHrs = parseFloat(estSchedBHours) || 0;
  const schedAOt1 = parseFloat(estOt1Hours) || 0;
  const schedBOt1Hrs = parseFloat(estSchedBOt1) || 0;
  const ot1Rate = parseFloat(estOt1Rate) || 1.5;
  const schedAOt2 = parseFloat(estOt2Hours) || 0;
  const schedBOt2Hrs = parseFloat(estSchedBOt2) || 0;
  const ot2Rate = parseFloat(estOt2Rate) || 2;
  const diffPct = parseFloat(estDiffPercent) || 0;
  const holidayDays = parseFloat(estHolidayDays) || 0;
  const holidayRate = parseFloat(estHolidayRate) || 1.5;
  const fedTaxPct = parseFloat(estFederalTax) || 0;
  const stateTaxPct = parseFloat(estStateTax) || 0;
  const retirementPct = parseFloat(estRetirement) || 0;
  const healthInsPer = parseFloat(estHealthIns) || 0;
  const otherDedPer = parseFloat(estOtherDed) || 0;

  // Effective weekly averages (rotation = 26 wks each, fixed = 52 wks)
  const avgHoursPerWeek = rotatingSchedule ? (schedAHrs + schedBHrs) / 2 : schedAHrs;
  const ot1Hrs = rotatingSchedule ? (schedAOt1 + schedBOt1Hrs) / 2 : schedAOt1;
  const ot2Hrs = rotatingSchedule ? (schedAOt2 + schedBOt2Hrs) / 2 : schedAOt2;

  const payPeriods = payFrequency === "weekly" ? 52 : payFrequency === "biweekly" ? 26 : payFrequency === "semimonthly" ? 24 : 12;

  const computeYearlyEstimate = () => {
    if (payType === "hourly" && baseRateNum > 0) {
      const weeksPerYear = 52;
      let basePay: number, ot1Pay: number, ot2Pay: number, diffPay: number;
      const avgDiff = diffItems.length > 0
        ? diffItems.reduce((sum, d) => sum + parseDiffAmount(d), 0) / diffItems.length
        : 0;

      if (rotatingSchedule) {
        const half = weeksPerYear / 2; // 26 weeks each
        basePay = baseRateNum * (schedAHrs * half + schedBHrs * half);
        ot1Pay = baseRateNum * ot1Rate * (schedAOt1 * half + schedBOt1Hrs * half);
        ot2Pay = baseRateNum * ot2Rate * (schedAOt2 * half + schedBOt2Hrs * half);
        diffPay = avgDiff * (schedAHrs * half + schedBHrs * half) * (diffPct / 100);
      } else {
        basePay = baseRateNum * schedAHrs * weeksPerYear;
        ot1Pay = baseRateNum * ot1Rate * schedAOt1 * weeksPerYear;
        ot2Pay = baseRateNum * ot2Rate * schedAOt2 * weeksPerYear;
        diffPay = avgDiff * schedAHrs * (diffPct / 100) * weeksPerYear;
      }

      const holidayPay = baseRateNum * holidayRate * 8 * holidayDays;
      const totalFromEvents = totalBonuses;
      return { basePay, ot1Pay, ot2Pay, diffPay, holidayPay, bonuses: totalFromEvents, total: basePay + ot1Pay + ot2Pay + diffPay + holidayPay + totalFromEvents };
    }
    const base = salary || (currentSalary?.amount ?? 0);
    return { basePay: base, ot1Pay: 0, ot2Pay: 0, diffPay: 0, holidayPay: 0, bonuses: totalBonuses, total: base + totalBonuses };
  };

  const est = computeYearlyEstimate();
  const grossPerPaycheck = est.total / payPeriods;

  // Per-schedule weekly gross for rotating schedules
  const computeWeeklyGross = (hrs: number, ot1: number, ot2: number) => {
    if (payType !== "hourly" || baseRateNum <= 0) return 0;
    const avgDiff = diffItems.length > 0
      ? diffItems.reduce((sum, d) => sum + parseDiffAmount(d), 0) / diffItems.length
      : 0;
    return baseRateNum * hrs
      + baseRateNum * ot1Rate * ot1
      + baseRateNum * ot2Rate * ot2
      + avgDiff * hrs * (diffPct / 100);
  };
  const weeklyGrossA = computeWeeklyGross(schedAHrs, schedAOt1, schedAOt2);
  const weeklyGrossB = computeWeeklyGross(schedBHrs, schedBOt1Hrs, schedBOt2Hrs);
  const showRotatingBreakdown = rotatingSchedule && payType === "hourly" && baseRateNum > 0;
  // Biweekly rotating = 1 A week + 1 B week per paycheck
  const biweeklyRotatingGross = weeklyGrossA + weeklyGrossB;

  const fedTaxAmt = grossPerPaycheck * (fedTaxPct / 100);
  const stateTaxAmt = grossPerPaycheck * (stateTaxPct / 100);
  const retirementAmt = grossPerPaycheck * (retirementPct / 100);
  const totalDeductions = fedTaxAmt + stateTaxAmt + retirementAmt + healthInsPer + otherDedPer;
  const netPerPaycheck = grossPerPaycheck - totalDeductions;

  // Per-schedule deductions helper
  const computeNet = (gross: number) => {
    const fed = gross * (fedTaxPct / 100);
    const state = gross * (stateTaxPct / 100);
    const ret = gross * (retirementPct / 100);
    return gross - fed - state - ret - healthInsPer - otherDedPer;
  };

  // Total hourly = base + all differential amounts
  const totalDiffAmount = diffItems.reduce((sum, d) => sum + parseDiffAmount(d), 0);
  const totalHourly = baseRateNum + totalDiffAmount;

  const handlePaycheckUpload = async (file: File) => {
    setPaycheckParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/paycheck-parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to parse paycheck");
        return;
      }
      setPaycheckData(data);
      setShowPaycheckPreview(true);
    } catch {
      toast.error("Failed to upload paycheck");
    } finally {
      setPaycheckParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyPaycheckData = () => {
    if (!paycheckData) return;
    const d = paycheckData;
    const p = d.percentages;

    // Use pre-computed percentages from the API when available
    if (p) {
      if (p.federalTax != null) setEstFederalTax(p.federalTax.toFixed(1));
      if (p.stateTax != null) setEstStateTax(p.stateTax.toFixed(1));
      if (p.retirement != null) setEstRetirement(p.retirement.toFixed(1));
    } else {
      // Fallback: compute from amounts
      const gross = d.grossPay || 0;
      if (gross > 0) {
        if (d.federalTax) setEstFederalTax(((d.federalTax / gross) * 100).toFixed(1));
        if (d.stateTax) setEstStateTax(((d.stateTax / gross) * 100).toFixed(1));
        if (d.retirement) setEstRetirement(((d.retirement / gross) * 100).toFixed(1));
      }
    }
    if (d.healthInsurance) setEstHealthIns(d.healthInsurance.toFixed(2));
    const otherDed = (d.socialSecurity || 0) + (d.medicare || 0) + (d.otherDeductions || 0);
    if (otherDed > 0) setEstOtherDed(otherDed.toFixed(2));

    // Open panels so user can see the populated values
    setShowEstimator(true);
    setShowTakeHome(true);
    setShowPaycheckPreview(false);
    toast.success("Paycheck data applied to estimator");
  };

  return (
    <div className="space-y-3">
      {/* ═══ Section: Pay Overview ═══ */}
      <button
        type="button"
        onClick={() => setSectionPay(!sectionPay)}
        className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-orange-50"><DollarSign className="h-3.5 w-3.5 text-orange-600" /></div>
          <div>
            <p className="text-sm font-semibold">Pay Overview</p>
            <p className="text-xs text-muted-foreground">
              {payType === "hourly" && baseRateNum > 0
                ? `$${totalHourly.toFixed(2)}/hr · ${events.length} event${events.length !== 1 ? "s" : ""}`
                : salary
                  ? `$${salary.toLocaleString()}/yr · ${events.length} event${events.length !== 1 ? "s" : ""}`
                  : `${events.length} event${events.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sectionPay ? "rotate-0" : "-rotate-90"}`} />
      </button>

      {sectionPay && (
        <div className="space-y-3 pl-1">
      {/* Upload Paycheck */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg p-2 bg-violet-50">
                <FileText className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <div>
                <p className="text-sm font-semibold">Upload Paycheck</p>
                <p className="text-xs text-muted-foreground">Upload a PDF paycheck to auto-fill your estimator &amp; deductions</p>
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePaycheckUpload(file);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={paycheckParsing}
                onClick={() => fileInputRef.current?.click()}
              >
                {paycheckParsing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Parsing...</>
                ) : (
                  <><Upload className="h-3.5 w-3.5 mr-1" /> Upload PDF</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {payType === "hourly" && baseRateNum > 0 ? (
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 bg-orange-50">
                <DollarSign className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Hourly Pay</p>
                <p className="text-lg font-bold">${totalHourly.toFixed(2)}/hr</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="rounded-lg p-2 bg-orange-50">
                <DollarSign className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Salary</p>
                <p className="text-lg font-bold">
                  {currentSalary
                    ? `${currentSalary.currency} ${currentSalary.amount.toLocaleString()}`
                    : salary
                      ? `${currency} ${salary.toLocaleString()}`
                      : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50">
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Bonuses</p>
              <p className="text-lg font-bold">
                {totalBonuses > 0
                  ? `${currency} ${totalBonuses.toLocaleString()}`
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg p-2 bg-indigo-50">
              <ArrowUpRight className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Events</p>
              <p className="text-lg font-bold">{events.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Rate & Differentials Breakdown */}
      {payType === "hourly" && baseRateNum > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-3.5 w-3.5" />
              Rate Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Base Rate</p>
                <p className="text-xl font-bold font-mono">{payRate}/hr</p>
              </div>
              {diffItems.length > 0 && diffItems.map((d, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Differential</p>
                  <p className="text-lg font-bold font-mono">{d}</p>
                </div>
              ))}
            </div>
            {schedule && (
              <p className="text-xs text-muted-foreground mt-3">
                Schedule: <span className="font-medium text-foreground">{schedule}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

        </div>
      )}

      {/* ═══ Section: Income Estimator ═══ */}
      <button
        type="button"
        onClick={() => setSectionEstimator(!sectionEstimator)}
        className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-emerald-50"><Calculator className="h-3.5 w-3.5 text-emerald-600" /></div>
          <div>
            <p className="text-sm font-semibold">Income Estimator</p>
            <p className="text-xs text-muted-foreground">
              ${est.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr gross
              {totalDeductions > 0 && ` · $${(netPerPaycheck * payPeriods).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr net`}
            </p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sectionEstimator ? "rotate-0" : "-rotate-90"}`} />
      </button>

      {sectionEstimator && (
        <div className="space-y-3 pl-1">
      {/* Yearly Compensation Estimator */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="h-3.5 w-3.5" />
              Yearly Compensation Estimate
            </CardTitle>
            {payType === "hourly" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEstimator(!showEstimator)}
              >
                {showEstimator ? "Hide" : "Adjust"} Inputs
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {payType === "hourly" && showEstimator && (
            <div className="mb-4 p-3 rounded-lg border border-dashed space-y-3">
              {rotatingSchedule ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">Schedule A (26 weeks) — {estHoursPerWeek} reg + {estOt1Hours} OT hrs/wk</p>
                  <p className="text-xs font-medium text-muted-foreground">Schedule B (26 weeks) — {estSchedBHours} reg + {estSchedBOt1} OT hrs/wk</p>
                  <p className="text-xs text-muted-foreground">OT Rate: {estOt1Rate}× (set in position settings)</p>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">OT2 Tier (additional)</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs mb-1">Sched A OT2 Hrs</Label>
                      <Input type="number" value={estOt2Hours} onChange={(e) => setEstOt2Hours(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1">Sched B OT2 Hrs</Label>
                      <Input type="number" value={estSchedBOt2} onChange={(e) => setEstSchedBOt2(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1">OT2 Multiplier</Label>
                      <Input type="number" step="0.1" value={estOt2Rate} onChange={(e) => setEstOt2Rate(e.target.value)} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Regular: <span className="font-medium text-foreground">{estHoursPerWeek} hrs/wk</span>
                    {parseFloat(estOt1Hours) > 0 && <> · OT: <span className="font-medium text-foreground">{estOt1Hours} hrs/wk @ {estOt1Rate}×</span></>}
                    <span className="text-muted-foreground/60 ml-1">(set in position settings)</span>
                  </p>
                  <Separator />
                  <p className="text-xs font-medium text-muted-foreground">OT2 Tier (additional)</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs mb-1">OT2 Hrs / Week</Label>
                      <Input type="number" value={estOt2Hours} onChange={(e) => setEstOt2Hours(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs mb-1">OT2 Multiplier</Label>
                      <Input type="number" step="0.1" value={estOt2Rate} onChange={(e) => setEstOt2Rate(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1">% Hours w/ Diff</Label>
                  <Input type="number" value={estDiffPercent} onChange={(e) => setEstDiffPercent(e.target.value)} />
                </div>
              </div>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground">Holiday Pay</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1">Paid Holidays / Year</Label>
                  <Input type="number" value={estHolidayDays} onChange={(e) => setEstHolidayDays(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Holiday Multiplier</Label>
                  <Input type="number" step="0.1" value={estHolidayRate} onChange={(e) => setEstHolidayRate(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {payType === "hourly"
                  ? rotatingSchedule
                    ? `Base Pay (A: ${schedAHrs}hrs × 26wks + B: ${schedBHrs}hrs × 26wks)`
                    : `Base Pay (${avgHoursPerWeek}hrs × 52wks)`
                  : "Base Salary"}
              </span>
              <span className="font-mono font-medium">
                ${est.basePay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
            {payType === "hourly" && est.ot1Pay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">OT1 ({ot1Rate}× · {ot1Hrs}hrs/wk)</span>
                <span className="font-mono font-medium text-orange-600">
                  +${est.ot1Pay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {payType === "hourly" && est.ot2Pay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">OT2 ({ot2Rate}× · {ot2Hrs}hrs/wk)</span>
                <span className="font-mono font-medium text-orange-600">
                  +${est.ot2Pay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {payType === "hourly" && est.diffPay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Differentials (~{diffPct}% of hours)</span>
                <span className="font-mono font-medium text-amber-600">
                  +${est.diffPay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {payType === "hourly" && est.holidayPay > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Holiday Pay ({holidayDays} days × {holidayRate}×)</span>
                <span className="font-mono font-medium text-purple-600">
                  +${est.holidayPay.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            )}
            {est.bonuses > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bonuses (from events)</span>
                <span className="font-mono font-medium text-green-600">
                  +${est.bonuses.toLocaleString()}
                </span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between">
              <span className="font-semibold">Estimated Yearly</span>
              <span className="text-xl font-bold font-mono">
                ${est.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                <span className="text-xs text-muted-foreground font-normal ml-1">/yr</span>
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Gross Per Paycheck ({payFrequency === "weekly" ? "Weekly" : payFrequency === "biweekly" ? "Bi-Weekly" : payFrequency === "semimonthly" ? "Semi-Monthly" : "Monthly"})
              </span>
              <span className="font-mono font-semibold">
                {showRotatingBreakdown && payFrequency === "biweekly"
                  ? `$${biweeklyRotatingGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${grossPerPaycheck.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </span>
            </div>
            {showRotatingBreakdown && payFrequency === "weekly" && (
              <>
                <div className="flex justify-between text-sm pl-3 border-l-2 border-orange-200">
                  <span className="text-muted-foreground">Schedule A Week</span>
                  <span className="font-mono font-medium">
                    ${weeklyGrossA.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm pl-3 border-l-2 border-amber-200">
                  <span className="text-muted-foreground">Schedule B Week</span>
                  <span className="font-mono font-medium">
                    ${weeklyGrossB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            )}
            {showRotatingBreakdown && payFrequency === "biweekly" && (
              <p className="text-xs text-muted-foreground pl-3 border-l-2 border-orange-200">
                Each paycheck covers 1 Schedule A week + 1 Schedule B week
              </p>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paychecks / Year</span>
              <span className="font-mono font-medium">{payPeriods}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Take-Home Estimate */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-3.5 w-3.5" />
              Take-Home Estimate
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowTakeHome(!showTakeHome)}>
              {showTakeHome ? "Hide" : "Configure"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showTakeHome && (
            <div className="mb-4 p-3 rounded-lg border border-dashed space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs mb-1">Federal Tax %</Label>
                  <Input type="number" step="0.1" value={estFederalTax} onChange={(e) => setEstFederalTax(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">State Tax %</Label>
                  <Input type="number" step="0.1" value={estStateTax} onChange={(e) => setEstStateTax(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Retirement / 401k %</Label>
                  <Input type="number" step="0.1" value={estRetirement} onChange={(e) => setEstRetirement(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1">Health Insurance / Period</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={estHealthIns} onChange={(e) => setEstHealthIns(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Other Deductions / Period</Label>
                  <Input type="number" step="0.01" placeholder="0.00" value={estOtherDed} onChange={(e) => setEstOtherDed(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gross Per Paycheck</span>
              <span className="font-mono font-medium">
                {showRotatingBreakdown && payFrequency === "biweekly"
                  ? `$${biweeklyRotatingGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${grossPerPaycheck.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </span>
            </div>
            {showRotatingBreakdown && payFrequency === "weekly" && (
              <>
                <div className="flex justify-between text-sm pl-3 border-l-2 border-orange-200">
                  <span className="text-muted-foreground">Schedule A Gross</span>
                  <span className="font-mono font-medium">
                    ${weeklyGrossA.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-sm pl-3 border-l-2 border-amber-200">
                  <span className="text-muted-foreground">Schedule B Gross</span>
                  <span className="font-mono font-medium">
                    ${weeklyGrossB.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            )}
            {fedTaxAmt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Federal Tax ({fedTaxPct}%)</span>
                <span className="font-mono font-medium text-red-500">
                  -${fedTaxAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {stateTaxAmt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">State Tax ({stateTaxPct}%)</span>
                <span className="font-mono font-medium text-red-500">
                  -${stateTaxAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {retirementAmt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Retirement / 401k ({retirementPct}%)</span>
                <span className="font-mono font-medium text-red-500">
                  -${retirementAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {healthInsPer > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Health Insurance</span>
                <span className="font-mono font-medium text-red-500">
                  -${healthInsPer.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {otherDedPer > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Other Deductions</span>
                <span className="font-mono font-medium text-red-500">
                  -${otherDedPer.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {totalDeductions > 0 && (
              <>
                <Separator />
                {showRotatingBreakdown && payFrequency === "weekly" ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">Net Per Paycheck (avg)</span>
                      <span className="text-lg font-bold font-mono text-green-600">
                        ${netPerPaycheck.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pl-3 border-l-2 border-orange-200">
                      <span className="text-muted-foreground">Schedule A Net</span>
                      <span className="font-mono font-semibold text-green-600">
                        ${computeNet(weeklyGrossA).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pl-3 border-l-2 border-amber-200">
                      <span className="text-muted-foreground">Schedule B Net</span>
                      <span className="font-mono font-semibold text-green-600">
                        ${computeNet(weeklyGrossB).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                ) : showRotatingBreakdown && payFrequency === "biweekly" ? (
                  <div className="flex justify-between">
                    <span className="font-semibold">Net Per Paycheck</span>
                    <span className="text-lg font-bold font-mono text-green-600">
                      ${computeNet(biweeklyRotatingGross).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="font-semibold">Net Per Paycheck</span>
                    <span className="text-lg font-bold font-mono text-green-600">
                      ${netPerPaycheck.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated Net / Year</span>
                  <span className="font-mono font-semibold text-green-600">
                    ${(netPerPaycheck * payPeriods).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    <span className="text-xs text-muted-foreground font-normal ml-1">/yr</span>
                  </span>
                </div>
              </>
            )}
            {totalDeductions === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Configure deductions above to see your take-home estimate
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Annual Raise Range */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Annual Raise Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            What annual raise % does this employer typically offer? Used in career income projections.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Min %</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 1"
                value={raiseMin}
                onChange={(e) => setRaiseMin(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max %</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 3"
                value={raiseMax}
                onChange={(e) => setRaiseMax(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          {raiseMin && raiseMax && (
            <p className="text-xs text-muted-foreground mt-2">
              Expected raise: <span className="font-medium text-foreground">{raiseMin}% – {raiseMax}%</span> per year
            </p>
          )}
        </CardContent>
      </Card>

        </div>
      )}

      {/* ═══ Section: Compensation History ═══ */}
      <button
        type="button"
        onClick={() => setSectionHistory(!sectionHistory)}
        className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg p-1.5 bg-amber-50"><Layers className="h-3.5 w-3.5 text-amber-600" /></div>
          <div>
            <p className="text-sm font-semibold">Compensation History</p>
            <p className="text-xs text-muted-foreground">
              {events.length} event{events.length !== 1 ? "s" : ""}
              {currentSalary && ` · Latest: ${currentSalary.currency} ${currentSalary.amount.toLocaleString()}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); resetForm(); setShowForm(true); setSectionHistory(true); }}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${sectionHistory ? "rotate-0" : "-rotate-90"}`} />
        </div>
      </button>

      {sectionHistory && (
        <div className="space-y-3 pl-1">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Compensation History</CardTitle>
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-4">
              <DollarSign className="h-6 w-6 text-muted-foreground mx-auto mb-1.5" />
              <p className="text-xs text-muted-foreground">No compensation events yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { resetForm(); setShowForm(true); }}
              >
                Add your first entry
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev, i) => {
                const prev = events[i + 1];
                const diff = prev && ev.recurring && prev.recurring
                  ? ev.amount - prev.amount
                  : null;
                return (
                  <div key={ev.id}>
                    {i > 0 && <Separator className="mb-3" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5">
                          {diff !== null && diff > 0 ? (
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                          ) : diff !== null && diff < 0 ? (
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                          ) : (
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{ev.title}</p>
                            <Badge className={TYPE_COLORS[ev.type] ?? TYPE_COLORS.other}>
                              {COMP_TYPES.find((t) => t.value === ev.type)?.label ?? ev.type}
                            </Badge>
                            {ev.recurring && (
                              <Badge variant="outline" className="text-xs">Recurring</Badge>
                            )}
                          </div>
                          <p className="text-sm font-mono font-semibold mt-0.5">
                            {ev.currency} {ev.amount.toLocaleString()}
                            {diff !== null && diff !== 0 && (
                              <span className={`ml-2 text-xs ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                                ({diff > 0 ? "+" : ""}{diff.toLocaleString()})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(ev.effectiveDate), "MMM d, yyyy")}
                          </p>
                          {ev.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{ev.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(ev)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => deleteMutation.mutate(ev.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Compensation</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="mb-1">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v ?? "base_salary" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Title *</Label>
              <Input
                required
                placeholder="e.g. Annual Raise, Q3 Bonus"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div>
                <Label className="mb-1">Amount *</Label>
                <Input
                  required
                  type="number"
                  placeholder="150000"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v ?? "USD" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Effective Date *</Label>
              <Input
                required
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="recurring"
                checked={form.recurring}
                onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="recurring" className="text-sm font-normal">
                Recurring (salary, stipend)
              </Label>
            </div>
            <div>
              <Label className="mb-1">Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                {editingId ? "Save Changes" : "Add"}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Paycheck Preview Dialog */}
      <Dialog open={showPaycheckPreview} onOpenChange={(open) => !open && setShowPaycheckPreview(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Paycheck Data Extracted
            </DialogTitle>
          </DialogHeader>
          {paycheckData && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Review what was found, then apply to auto-fill the estimator and take-home fields.</p>
              <div className="rounded-lg border divide-y text-sm">
                {paycheckData.grossPay != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Gross Pay</span>
                    <span className="font-mono font-semibold">${paycheckData.grossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {paycheckData.netPay != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Net Pay</span>
                    <span className="font-mono font-semibold text-green-600">${paycheckData.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {paycheckData.payRate != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Pay Rate</span>
                    <span className="font-mono">${paycheckData.payRate.toFixed(2)}/hr</span>
                  </div>
                )}
                {paycheckData.regularHours != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Regular Hours</span>
                    <span className="font-mono">{paycheckData.regularHours}</span>
                  </div>
                )}
                {paycheckData.overtimeHours != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Overtime Hours</span>
                    <span className="font-mono">{paycheckData.overtimeHours}</span>
                  </div>
                )}
                {paycheckData.federalTax != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Federal Tax</span>
                    <span className="font-mono text-red-500">-${paycheckData.federalTax.toFixed(2)}{paycheckData.percentages?.federalTax != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.federalTax}%)</span>}</span>
                  </div>
                )}
                {paycheckData.stateTax != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">State Tax</span>
                    <span className="font-mono text-red-500">-${paycheckData.stateTax.toFixed(2)}{paycheckData.percentages?.stateTax != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.stateTax}%)</span>}</span>
                  </div>
                )}
                {paycheckData.socialSecurity != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Social Security</span>
                    <span className="font-mono text-red-500">-${paycheckData.socialSecurity.toFixed(2)}{paycheckData.percentages?.socialSecurity != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.socialSecurity}%)</span>}</span>
                  </div>
                )}
                {paycheckData.medicare != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Medicare</span>
                    <span className="font-mono text-red-500">-${paycheckData.medicare.toFixed(2)}{paycheckData.percentages?.medicare != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.medicare}%)</span>}</span>
                  </div>
                )}
                {paycheckData.retirement != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Retirement / 401k</span>
                    <span className="font-mono text-red-500">-${paycheckData.retirement.toFixed(2)}{paycheckData.percentages?.retirement != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.retirement}%)</span>}</span>
                  </div>
                )}
                {paycheckData.healthInsurance != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Health Insurance</span>
                    <span className="font-mono text-red-500">-${paycheckData.healthInsurance.toFixed(2)}{paycheckData.percentages?.healthInsurance != null && <span className="text-xs text-muted-foreground ml-1">({paycheckData.percentages.healthInsurance}%)</span>}</span>
                  </div>
                )}
                {paycheckData.otherDeductions != null && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Other Deductions</span>
                    <span className="font-mono text-red-500">-${paycheckData.otherDeductions.toFixed(2)}</span>
                  </div>
                )}
                {paycheckData.percentages?.totalDeductions != null && (
                  <div className="flex justify-between px-3 py-2 bg-muted/50">
                    <span className="text-muted-foreground font-medium">Total Deduction Rate</span>
                    <span className="font-mono font-semibold">{paycheckData.percentages.totalDeductions}%</span>
                  </div>
                )}
                {paycheckData.payPeriodStart && paycheckData.payPeriodEnd && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Pay Period</span>
                    <span className="font-mono text-xs">{paycheckData.payPeriodStart} – {paycheckData.payPeriodEnd}</span>
                  </div>
                )}
              </div>
              {!paycheckData.grossPay && !paycheckData.netPay && !paycheckData.regularHours && (
                <p className="text-xs text-amber-600 text-center">No recognizable fields were found. The paycheck format may not be supported.</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button className="flex-1" onClick={applyPaycheckData}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Apply to Estimator
                </Button>
                <Button variant="outline" onClick={() => setShowPaycheckPreview(false)}>Dismiss</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

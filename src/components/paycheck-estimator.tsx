"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Calculator,
  Upload,
  Loader2,
  FileText,
  RefreshCw,
} from "lucide-react";

interface Props {
  payType: string;
  payRate: string | null;
  differentials: string | null;
  salary: number | null;
  payFrequency: string;
  rotatingSchedule: boolean;
  hoursPerWeek: number | null;
  scheduleBHours: number | null;
  otHoursA: number | null;
  otHoursB: number | null;
  otRate: number | null;
  estimatorSettings: string | null;
}

interface TaxProfile {
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  retirement: number;
  healthInsurance: number;
  otherDeductions: number;
  source: "paycheck" | "manual";
}

const fmtD = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaycheckEstimator({
  payType, payRate, differentials, salary,
  payFrequency, rotatingSchedule,
  hoursPerWeek, scheduleBHours,
  otHoursA, otHoursB, otRate,
  estimatorSettings,
}: Props) {
  const baseRate = payRate ? parseFloat(payRate.replace(/[^0-9.]/g, "")) : 0;

  // Parse saved settings for tax defaults
  const saved = (() => {
    try { return estimatorSettings ? JSON.parse(estimatorSettings) : {}; }
    catch { return {}; }
  })();

  // Tax profile — can be populated from paycheck upload or set manually
  const [taxProfile, setTaxProfile] = useState<TaxProfile>({
    federalTax: parseFloat(saved.estFederalTax ?? "22"),
    stateTax: parseFloat(saved.estStateTax ?? "5"),
    socialSecurity: 6.2,
    medicare: 1.45,
    retirement: parseFloat(saved.estRetirement ?? "0"),
    healthInsurance: parseFloat(saved.estHealthIns ?? "0"),
    otherDeductions: parseFloat(saved.estOtherDed ?? "0"),
    source: "manual",
  });

  // Custom hours for the estimate (defaults to position hours)
  const [customHours, setCustomHours] = useState(String(hoursPerWeek ?? 40));
  const [customOtHours, setCustomOtHours] = useState(String(otHoursA ?? 0));
  const [customSchedBHours, setCustomSchedBHours] = useState(String(scheduleBHours ?? 40));
  const [customSchedBOt, setCustomSchedBOt] = useState(String(otHoursB ?? 0));
  const [showCustom, setShowCustom] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveOtRate = otRate ?? 1.5;

  // Parse differential amounts
  const diffItems = differentials?.split("\n").filter(Boolean) ?? [];
  const avgDiff = diffItems.length > 0
    ? diffItems.reduce((sum, d) => {
        const m = d.match(/[+-]?\$?([\d.]+)/);
        return sum + (m ? parseFloat(m[1]) : 0);
      }, 0) / diffItems.length
    : 0;
  const diffPct = parseFloat(saved.estDiffPercent ?? "50") / 100;

  const payPeriods = payFrequency === "weekly" ? 52 : payFrequency === "biweekly" ? 26 : payFrequency === "semimonthly" ? 24 : 12;

  // Compute the estimated paycheck
  const computePaycheck = () => {
    if (payType !== "hourly" || baseRate <= 0) {
      // Salaried
      const annualBase = salary ?? 0;
      const grossPer = annualBase / payPeriods;
      return computeDeductions(grossPer);
    }

    const regHrs = parseFloat(customHours) || 0;
    const otHrs = parseFloat(customOtHours) || 0;
    const regBHrs = parseFloat(customSchedBHours) || 0;
    const otBHrs = parseFloat(customSchedBOt) || 0;

    let grossPer: number;
    if (rotatingSchedule && payFrequency === "biweekly") {
      // Biweekly: 1 week of each schedule
      const weekA = baseRate * regHrs + baseRate * effectiveOtRate * otHrs + avgDiff * regHrs * diffPct;
      const weekB = baseRate * regBHrs + baseRate * effectiveOtRate * otBHrs + avgDiff * regBHrs * diffPct;
      grossPer = weekA + weekB;
    } else if (rotatingSchedule && payFrequency === "weekly") {
      // Weekly rotating: average of the two schedules
      const weekA = baseRate * regHrs + baseRate * effectiveOtRate * otHrs + avgDiff * regHrs * diffPct;
      const weekB = baseRate * regBHrs + baseRate * effectiveOtRate * otBHrs + avgDiff * regBHrs * diffPct;
      grossPer = (weekA + weekB) / 2;
    } else {
      // Fixed schedule
      const weeksPerPeriod = payFrequency === "weekly" ? 1 : payFrequency === "biweekly" ? 2 : payFrequency === "semimonthly" ? 52 / 24 : 52 / 12;
      grossPer = (baseRate * regHrs + baseRate * effectiveOtRate * otHrs + avgDiff * regHrs * diffPct) * weeksPerPeriod;
    }

    return computeDeductions(grossPer);
  };

  const computeDeductions = (gross: number) => {
    const fedTax = gross * (taxProfile.federalTax / 100);
    const stateTax = gross * (taxProfile.stateTax / 100);
    const ss = gross * (taxProfile.socialSecurity / 100);
    const med = gross * (taxProfile.medicare / 100);
    const ret = gross * (taxProfile.retirement / 100);
    const health = taxProfile.healthInsurance;
    const other = taxProfile.otherDeductions;
    const totalDed = fedTax + stateTax + ss + med + ret + health + other;
    const net = gross - totalDed;
    return { gross, fedTax, stateTax, ss, med, ret, health, other, totalDed, net };
  };

  const est = computePaycheck();

  // Upload paycheck to auto-fill tax percentages
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/paycheck-parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to parse paycheck");
        return;
      }
      const p = data.percentages;
      if (p) {
        setTaxProfile({
          federalTax: p.federalTax ?? taxProfile.federalTax,
          stateTax: p.stateTax ?? taxProfile.stateTax,
          socialSecurity: p.socialSecurity ?? 6.2,
          medicare: p.medicare ?? 1.45,
          retirement: p.retirement ?? taxProfile.retirement,
          healthInsurance: data.healthInsurance ?? taxProfile.healthInsurance,
          otherDeductions: ((data.socialSecurity ?? 0) + (data.medicare ?? 0) + (data.otherDeductions ?? 0)) > 0
            ? 0 // SS/Medicare are now tracked separately  
            : taxProfile.otherDeductions,
          source: "paycheck",
        });
        toast.success("Tax rates imported from paycheck");
      }
    } catch {
      toast.error("Failed to upload paycheck");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const periodLabel = payFrequency === "weekly" ? "Weekly" : payFrequency === "biweekly" ? "Bi-Weekly" : payFrequency === "semimonthly" ? "Semi-Monthly" : "Monthly";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-violet-600" />
            Paycheck Estimator
          </CardTitle>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Parsing...</>
              ) : (
                <><FileText className="h-3.5 w-3.5 mr-1" /> Import Rates</>
              )}
            </Button>
            {payType === "hourly" && (
              <Button size="sm" variant="outline" onClick={() => setShowCustom(!showCustom)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> {showCustom ? "Hide" : "Custom"} Hours
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimate your next {periodLabel.toLowerCase()} paycheck based on your current pay info and tax rates.
          {taxProfile.source === "paycheck" && (
            <span className="ml-1 text-emerald-600 font-medium">Tax rates from paycheck ✓</span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Custom Hours Input */}
        {showCustom && payType === "hourly" && (
          <div className="p-3 rounded-lg border border-dashed space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Custom Hours for This Paycheck</p>
            {rotatingSchedule ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1">Schedule A Hours</Label>
                  <Input type="number" value={customHours} onChange={(e) => setCustomHours(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Schedule A OT</Label>
                  <Input type="number" value={customOtHours} onChange={(e) => setCustomOtHours(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Schedule B Hours</Label>
                  <Input type="number" value={customSchedBHours} onChange={(e) => setCustomSchedBHours(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">Schedule B OT</Label>
                  <Input type="number" value={customSchedBOt} onChange={(e) => setCustomSchedBOt(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs mb-1">Regular Hours</Label>
                  <Input type="number" value={customHours} onChange={(e) => setCustomHours(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">OT Hours</Label>
                  <Input type="number" value={customOtHours} onChange={(e) => setCustomOtHours(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tax Rate Inputs */}
        <div className="p-3 rounded-lg border border-dashed space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Tax & Deduction Rates</p>
            {taxProfile.source === "paycheck" && (
              <Upload className="h-3 w-3 text-emerald-600" />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs mb-1">Federal %</Label>
              <Input type="number" step="0.1" value={taxProfile.federalTax}
                onChange={(e) => setTaxProfile({ ...taxProfile, federalTax: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
            <div>
              <Label className="text-xs mb-1">State %</Label>
              <Input type="number" step="0.1" value={taxProfile.stateTax}
                onChange={(e) => setTaxProfile({ ...taxProfile, stateTax: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
            <div>
              <Label className="text-xs mb-1">Soc Security %</Label>
              <Input type="number" step="0.01" value={taxProfile.socialSecurity}
                onChange={(e) => setTaxProfile({ ...taxProfile, socialSecurity: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
            <div>
              <Label className="text-xs mb-1">Medicare %</Label>
              <Input type="number" step="0.01" value={taxProfile.medicare}
                onChange={(e) => setTaxProfile({ ...taxProfile, medicare: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
            <div>
              <Label className="text-xs mb-1">Retirement %</Label>
              <Input type="number" step="0.1" value={taxProfile.retirement}
                onChange={(e) => setTaxProfile({ ...taxProfile, retirement: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
            <div>
              <Label className="text-xs mb-1">Health Ins $/period</Label>
              <Input type="number" step="0.01" value={taxProfile.healthInsurance}
                onChange={(e) => setTaxProfile({ ...taxProfile, healthInsurance: parseFloat(e.target.value) || 0, source: "manual" })} />
            </div>
          </div>
        </div>

        {/* Paycheck Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gross Pay ({periodLabel})</span>
            <span className="font-mono font-bold text-lg">{fmtD(est.gross)}</span>
          </div>

          <Separator />

          {est.fedTax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Federal Tax ({taxProfile.federalTax}%)</span>
              <span className="font-mono text-red-500">-{fmtD(est.fedTax)}</span>
            </div>
          )}
          {est.stateTax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">State Tax ({taxProfile.stateTax}%)</span>
              <span className="font-mono text-red-500">-{fmtD(est.stateTax)}</span>
            </div>
          )}
          {est.ss > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Social Security ({taxProfile.socialSecurity}%)</span>
              <span className="font-mono text-red-500">-{fmtD(est.ss)}</span>
            </div>
          )}
          {est.med > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Medicare ({taxProfile.medicare}%)</span>
              <span className="font-mono text-red-500">-{fmtD(est.med)}</span>
            </div>
          )}
          {est.ret > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Retirement ({taxProfile.retirement}%)</span>
              <span className="font-mono text-red-500">-{fmtD(est.ret)}</span>
            </div>
          )}
          {est.health > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Health Insurance</span>
              <span className="font-mono text-red-500">-{fmtD(est.health)}</span>
            </div>
          )}
          {est.other > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Other Deductions</span>
              <span className="font-mono text-red-500">-{fmtD(est.other)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Deductions</span>
            <span className="font-mono font-semibold text-red-500">-{fmtD(est.totalDed)}</span>
          </div>

          <div className="flex justify-between items-baseline pt-1">
            <span className="font-semibold">Estimated Net Pay</span>
            <span className="text-2xl font-bold font-mono text-emerald-600">{fmtD(est.net)}</span>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            <span>Annual Gross (est)</span>
            <span className="text-right font-mono">{fmtD(est.gross * payPeriods)}</span>
            <span>Annual Net (est)</span>
            <span className="text-right font-mono text-emerald-600">{fmtD(est.net * payPeriods)}</span>
            <span>Annual Deductions</span>
            <span className="text-right font-mono text-red-500">-{fmtD(est.totalDed * payPeriods)}</span>
            <span>Effective Tax Rate</span>
            <span className="text-right font-mono">
              {est.gross > 0 ? `${((est.totalDed / est.gross) * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

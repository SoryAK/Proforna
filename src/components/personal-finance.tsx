"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Home,
  Car,
  Wifi,
  Phone,
  ShoppingCart,
  Fuel,
  CreditCard,
  GraduationCap,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Pencil,
  Check,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { sumDollars, subtractDollars, fmtMoney } from "@/lib/money";

/* ── Types ── */

interface MonthlyExpenses {
  rent: string;
  utilities: string;
  car: string;
  carInsurance: string;
  phone: string;
  subscriptions: string;
  groceries: string;
  gas: string;
  studentLoans: string;
  creditCards: string;
  otherDebt: string;
  savings: string;
  otherExpenses: string;
}

interface Profile {
  id: string;
  filingStatus: string;
  federalTaxRate: number | null;
  stateTaxRate: number | null;
  monthlyExpenses: string | null;
}

interface CompEvent {
  id: string;
  type: string;
  title: string;
  amount: number;
  currency: string;
  effectiveDate: string;
  recurring: boolean;
}

interface Position {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
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

interface Props {
  positionId: string;
  payType: string;
  payRate: string | null;
  salary: number | null;
  payFrequency: string;
  hoursPerWeek: number | null;
  scheduleBHours: number | null;
  rotatingSchedule: boolean;
  otHoursA: number | null;
  otHoursB: number | null;
  otRate: number | null;
  differentials: string | null;
  estimatorSettings: string | null;
}

/* ── Expense categories ── */

const EXPENSE_FIELDS: { key: keyof MonthlyExpenses; label: string; icon: React.ElementType; color: string }[] = [
  { key: "rent", label: "Rent / Mortgage", icon: Home, color: "text-orange-600" },
  { key: "utilities", label: "Utilities", icon: Wifi, color: "text-cyan-600" },
  { key: "car", label: "Car Payment", icon: Car, color: "text-indigo-600" },
  { key: "carInsurance", label: "Car Insurance", icon: Car, color: "text-violet-600" },
  { key: "phone", label: "Phone", icon: Phone, color: "text-green-600" },
  { key: "subscriptions", label: "Subscriptions", icon: Receipt, color: "text-pink-600" },
  { key: "groceries", label: "Groceries", icon: ShoppingCart, color: "text-orange-600" },
  { key: "gas", label: "Gas / Transit", icon: Fuel, color: "text-amber-600" },
  { key: "studentLoans", label: "Student Loans", icon: GraduationCap, color: "text-red-600" },
  { key: "creditCards", label: "Credit Cards", icon: CreditCard, color: "text-rose-600" },
  { key: "otherDebt", label: "Other Debt", icon: CreditCard, color: "text-gray-600" },
  { key: "savings", label: "Savings Goal", icon: PiggyBank, color: "text-emerald-600" },
  { key: "otherExpenses", label: "Other Expenses", icon: Wallet, color: "text-slate-600" },
];

const defaultExpenses: MonthlyExpenses = {
  rent: "", utilities: "", car: "", carInsurance: "", phone: "",
  subscriptions: "", groceries: "", gas: "", studentLoans: "",
  creditCards: "", otherDebt: "", savings: "", otherExpenses: "",
};

/* ── Component ── */

export function PersonalFinance({
  positionId, payType, payRate, salary, payFrequency,
  hoursPerWeek, scheduleBHours, rotatingSchedule,
  otHoursA, otHoursB, otRate, differentials, estimatorSettings,
}: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [expenses, setExpenses] = useState<MonthlyExpenses>(defaultExpenses);
  const [filingStatus, setFilingStatus] = useState("single");
  const [fedRate, setFedRate] = useState("");
  const [stateRate, setStateRate] = useState("");

  // Fetch profile for saved finance data
  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: () => fetch("/api/profile").then(r => r.json()),
  });

  // Fetch all positions for income history
  const { data: positions = [] } = useQuery<Position[]>({
    queryKey: ["current-position"],
    queryFn: () => fetch("/api/current-position").then(r => r.json()),
  });

  // Fetch comp events for current position
  const { data: compEvents = [] } = useQuery<CompEvent[]>({
    queryKey: ["compensation", positionId],
    queryFn: () => fetch(`/api/compensation?positionId=${positionId}`).then(r => r.json()),
  });

  // Hydrate from profile on load
  useEffect(() => {
    if (!profile) return;
    setFilingStatus(profile.filingStatus || "single");
    setFedRate(profile.federalTaxRate?.toString() ?? "");
    setStateRate(profile.stateTaxRate?.toString() ?? "");
    try {
      const saved = profile.monthlyExpenses ? JSON.parse(profile.monthlyExpenses) : {};
      setExpenses({ ...defaultExpenses, ...saved });
    } catch {
      setExpenses(defaultExpenses);
    }
  }, [profile]);

  // Save to profile
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveFinances = useCallback(() => {
    const body = {
      filingStatus,
      federalTaxRate: fedRate ? parseFloat(fedRate) : null,
      stateTaxRate: stateRate ? parseFloat(stateRate) : null,
      monthlyExpenses: JSON.stringify(expenses),
    };
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    });
  }, [filingStatus, fedRate, stateRate, expenses, queryClient]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current) { hasInitialized.current = true; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveFinances, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [saveFinances]);

  /* ── Income calculations ── */

  const baseRateNum = payRate ? parseFloat(payRate.replace(/[^0-9.]/g, "")) : 0;
  const payPeriods = payFrequency === "weekly" ? 52 : payFrequency === "biweekly" ? 26 : payFrequency === "semimonthly" ? 24 : 12;

  // Parse estimator settings for OT2 / diff / holiday
  const estSettings: Record<string, string> = (() => {
    try { return estimatorSettings ? JSON.parse(estimatorSettings) : {}; } catch { return {}; }
  })();

  const schedAHrs = hoursPerWeek || 40;
  const schedBHrs = scheduleBHours || 40;
  const ot1HrsA = otHoursA || 0;
  const ot1HrsB = otHoursB || 0;
  const ot1Mult = otRate || 1.5;
  const ot2HrsA = parseFloat(estSettings.estOt2Hours || "0");
  const ot2HrsB = parseFloat(estSettings.estSchedBOt2 || "0");
  const ot2Mult = parseFloat(estSettings.estOt2Rate || "2");
  const diffPct = parseFloat(estSettings.estDiffPercent || "50") / 100;
  const holidayDays = parseFloat(estSettings.estHolidayDays || "0");
  const holidayRate = parseFloat(estSettings.estHolidayRate || "1.5");

  const diffItems = differentials?.split("\n").filter(Boolean) ?? [];
  const parseDiffAmt = (d: string) => { const m = d.match(/[+-]?\$?([\d.]+)/); return m ? parseFloat(m[1]) : 0; };
  const avgDiff = diffItems.length > 0 ? diffItems.reduce((s, d) => s + parseDiffAmt(d), 0) / diffItems.length : 0;

  // Compute gross annual
  let grossAnnual: number;
  if (payType === "hourly" && baseRateNum > 0) {
    const weeks = 52;
    let base: number, ot1: number, ot2: number, diff: number;
    if (rotatingSchedule) {
      const half = weeks / 2;
      base = baseRateNum * (schedAHrs * half + schedBHrs * half);
      ot1 = baseRateNum * ot1Mult * (ot1HrsA * half + ot1HrsB * half);
      ot2 = baseRateNum * ot2Mult * (ot2HrsA * half + ot2HrsB * half);
      diff = avgDiff * (schedAHrs * half + schedBHrs * half) * diffPct;
    } else {
      base = baseRateNum * schedAHrs * weeks;
      ot1 = baseRateNum * ot1Mult * ot1HrsA * weeks;
      ot2 = baseRateNum * ot2Mult * ot2HrsA * weeks;
      diff = avgDiff * schedAHrs * diffPct * weeks;
    }
    const hol = baseRateNum * holidayRate * 8 * holidayDays;
    const bonuses = compEvents.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0);
    grossAnnual = base + ot1 + ot2 + diff + hol + bonuses;
  } else {
    const base = salary || compEvents.filter(e => e.recurring).sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0]?.amount || 0;
    const bonuses = compEvents.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0);
    grossAnnual = base + bonuses;
  }

  const grossMonthly = grossAnnual / 12;
  const grossPerPaycheck = grossAnnual / payPeriods;

  // Taxes
  const fedPct = fedRate ? parseFloat(fedRate) : (parseFloat(estSettings.estFederalTax || "22"));
  const statePct = stateRate ? parseFloat(stateRate) : (parseFloat(estSettings.estStateTax || "5"));
  const fedTaxMonthly = grossMonthly * (fedPct / 100);
  const stateTaxMonthly = grossMonthly * (statePct / 100);
  const totalTaxMonthly = fedTaxMonthly + stateTaxMonthly;

  // Retirement from estimator settings (applies per paycheck)
  const retPct = parseFloat(estSettings.estRetirement || "0");
  const retMonthly = grossMonthly * (retPct / 100);
  const healthInsPer = parseFloat(estSettings.estHealthIns || "0");
  const otherDedPer = parseFloat(estSettings.estOtherDed || "0");
  // Health ins and other ded are per-paycheck amounts, convert to monthly
  const healthInsMonthly = healthInsPer * (payPeriods / 12);
  const otherDedMonthly = otherDedPer * (payPeriods / 12);

  const netMonthly = subtractDollars(
    grossMonthly,
    sumDollars([totalTaxMonthly, retMonthly, healthInsMonthly, otherDedMonthly])
  );

  // Expenses
  const totalExpenses = sumDollars(
    EXPENSE_FIELDS.map((f) => parseFloat(expenses[f.key]) || 0)
  );

  const leftOver = subtractDollars(netMonthly, totalExpenses);

  /* ── Income history from positions ── */

  const incomeHistory = positions
    .filter(p => p.salary || p.payRate)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .map(p => {
      let annual = 0;
      if (p.payType === "hourly" && p.payRate) {
        const rate = parseFloat(p.payRate.replace(/[^0-9.]/g, "")) || 0;
        const hrs = p.hoursPerWeek || 40;
        const hrsB = p.scheduleBHours || hrs;
        annual = rate * (p.rotatingSchedule ? (hrs + hrsB) / 2 : hrs) * 52;
      } else {
        annual = p.salary || 0;
      }
      return {
        id: p.id,
        company: p.company,
        role: p.role,
        startDate: p.startDate,
        endDate: p.endDate,
        annual,
        isActive: p.isActive,
      };
    });

  const fmt = fmtMoney;

  return (
    <div className="space-y-4">
      {/* ── Monthly Overview Cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Net Monthly Income
            </div>
            <p className="text-2xl font-bold font-mono text-emerald-600">${fmt(netMonthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">${fmt(grossMonthly)} gross &minus; ${fmt(totalTaxMonthly + retMonthly + healthInsMonthly + otherDedMonthly)} deductions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Total Expenses
            </div>
            <p className="text-2xl font-bold font-mono text-red-600">${fmt(totalExpenses)}</p>
            <p className="text-xs text-muted-foreground mt-1">{EXPENSE_FIELDS.filter(f => parseFloat(expenses[f.key]) > 0).length} categories</p>
          </CardContent>
        </Card>
        <Card className={leftOver >= 0 ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Wallet className="h-4 w-4" />
              Money Left Over
            </div>
            <p className={`text-2xl font-bold font-mono ${leftOver >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {leftOver < 0 ? "-" : ""}${fmt(Math.abs(leftOver))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {leftOver >= 0 ? `${((leftOver / netMonthly) * 100).toFixed(0)}% of net income remaining` : "Expenses exceed net income"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Income Breakdown ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Monthly Income Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Gross Monthly</span>
            <span className="font-mono font-medium">${fmt(grossMonthly)}</span>
          </div>
          <Separator />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Federal Tax ({fedPct}%)</span>
              <span className="font-mono">-${fmt(fedTaxMonthly)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>State Tax ({statePct}%)</span>
              <span className="font-mono">-${fmt(stateTaxMonthly)}</span>
            </div>
            {retMonthly > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Retirement ({retPct}%)</span>
                <span className="font-mono">-${fmt(retMonthly)}</span>
              </div>
            )}
            {healthInsMonthly > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Health Insurance</span>
                <span className="font-mono">-${fmt(healthInsMonthly)}</span>
              </div>
            )}
            {otherDedMonthly > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Other Deductions</span>
                <span className="font-mono">-${fmt(otherDedMonthly)}</span>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex justify-between text-sm font-medium">
            <span>Net Monthly Take-Home</span>
            <span className="font-mono text-emerald-600">${fmt(netMonthly)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Per Paycheck ({payFrequency})</span>
            <span className="font-mono">${fmt(grossPerPaycheck - grossPerPaycheck * (fedPct + statePct + retPct) / 100 - healthInsPer - otherDedPer)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Monthly Expenses ── */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Monthly Expenses
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
            {editing ? <Check className="h-4 w-4 mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
            {editing ? "Done" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Tax settings (always at top when editing) */}
          {editing && (
            <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-3">
              <p className="text-sm font-medium">Tax & Filing Settings</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs mb-1">Filing Status</Label>
                  <Select value={filingStatus} onValueChange={v => setFilingStatus(v ?? "single")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married_joint">Married Filing Jointly</SelectItem>
                      <SelectItem value="married_separate">Married Filing Separately</SelectItem>
                      <SelectItem value="head_of_household">Head of Household</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1">Federal Tax %</Label>
                  <Input type="number" step="0.1" placeholder={`${fedPct}`} value={fedRate} onChange={e => setFedRate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1">State Tax %</Label>
                  <Input type="number" step="0.1" placeholder={`${statePct}`} value={stateRate} onChange={e => setStateRate(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">These are saved to your profile and will carry over to job offer comparisons.</p>
            </div>
          )}

          {editing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {EXPENSE_FIELDS.map(({ key, label, icon: Icon, color }) => (
                <div key={key} className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                  <Label className="text-sm min-w-[120px]">{label}</Label>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      className="pl-6"
                      placeholder="0"
                      value={expenses[key]}
                      onChange={e => setExpenses({ ...expenses, [key]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {EXPENSE_FIELDS.filter(f => parseFloat(expenses[f.key]) > 0).length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No expenses entered yet</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Add Expenses
                  </Button>
                </div>
              ) : (
                <>
                  {EXPENSE_FIELDS.filter(f => parseFloat(expenses[f.key]) > 0).map(({ key, label, icon: Icon, color }) => {
                    const val = parseFloat(expenses[key]) || 0;
                    const pct = netMonthly > 0 ? (val / netMonthly) * 100 : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${color}`} />
                            <span>{label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                            <span className="font-mono font-medium w-20 text-right">${fmt(val)}</span>
                          </div>
                        </div>
                        {/* Bar */}
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-current opacity-30" style={{ width: `${Math.min(pct, 100)}%`, color: color.replace("text-", "").split("-").slice(0, -1).join("-") }} />
                        </div>
                      </div>
                    );
                  })}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total Monthly Expenses</span>
                    <span className="font-mono text-red-600">${fmt(totalExpenses)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Where Your Money Goes (visual summary) ── */}
      {totalExpenses > 0 && netMonthly > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Monthly Budget Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Stacked bar */}
            <div className="h-6 rounded-full overflow-hidden flex bg-muted">
              <div
                className="bg-red-400 dark:bg-red-600 transition-all"
                style={{ width: `${Math.min((totalTaxMonthly / grossMonthly) * 100, 100)}%` }}
                title={`Taxes: $${fmt(totalTaxMonthly)}`}
              />
              <div
                className="bg-amber-400 dark:bg-amber-600 transition-all"
                style={{ width: `${Math.min(((retMonthly + healthInsMonthly + otherDedMonthly) / grossMonthly) * 100, 100)}%` }}
                title={`Deductions: $${fmt(retMonthly + healthInsMonthly + otherDedMonthly)}`}
              />
              <div
                className="bg-orange-400 dark:bg-orange-600 transition-all"
                style={{ width: `${Math.min((totalExpenses / grossMonthly) * 100, 100)}%` }}
                title={`Expenses: $${fmt(totalExpenses)}`}
              />
              <div
                className={`${leftOver >= 0 ? "bg-emerald-400 dark:bg-emerald-600" : "bg-red-600"} transition-all flex-1`}
                title={`Remaining: $${fmt(Math.max(leftOver, 0))}`}
              />
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400 dark:bg-red-600" />
                Taxes ({((totalTaxMonthly / grossMonthly) * 100).toFixed(0)}%)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400 dark:bg-amber-600" />
                Deductions ({(((retMonthly + healthInsMonthly + otherDedMonthly) / grossMonthly) * 100).toFixed(0)}%)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-400 dark:bg-orange-600" />
                Expenses ({((totalExpenses / grossMonthly) * 100).toFixed(0)}%)
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${leftOver >= 0 ? "bg-emerald-400 dark:bg-emerald-600" : "bg-red-600"}`} />
                Remaining ({((Math.max(leftOver, 0) / grossMonthly) * 100).toFixed(0)}%)
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Income History ── */}
      {incomeHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Income History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {incomeHistory.map((pos, i) => {
                const prev = i > 0 ? incomeHistory[i - 1].annual : 0;
                const change = prev > 0 ? ((pos.annual - prev) / prev) * 100 : 0;
                return (
                  <div key={pos.id}>
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full shrink-0 ${pos.isActive ? "bg-emerald-500" : "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{pos.role}</p>
                            <p className="text-xs text-muted-foreground">{pos.company}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-mono font-medium">${fmt(pos.annual)}<span className="text-xs text-muted-foreground">/yr</span></p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(pos.startDate), "MMM yyyy")}
                              {pos.endDate ? ` – ${format(new Date(pos.endDate), "MMM yyyy")}` : " – Present"}
                            </p>
                          </div>
                        </div>
                        {change !== 0 && (
                          <Badge variant="secondary" className={`mt-1 text-xs ${change > 0 ? "text-emerald-700 bg-emerald-100" : "text-red-700 bg-red-100"}`}>
                            {change > 0 ? "+" : ""}{change.toFixed(1)}% from previous
                          </Badge>
                        )}
                      </div>
                    </div>
                    {i < incomeHistory.length - 1 && (
                      <div className="ml-1.5 border-l-2 border-dashed border-muted h-3 mt-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

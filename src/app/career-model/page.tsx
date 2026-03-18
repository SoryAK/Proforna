"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
  Target,
  DollarSign,
  Calendar,
  BarChart3,
  ArrowRight,
  Minus,
  Info,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Receipt,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ReferenceLine,
  Bar,
  BarChart,
  Legend,
} from "recharts";

/* ── Types ── */

interface IncomeEntry {
  id: string;
  yearId: string;
  employer: string;
  grossIncome: number;
  netIncome: number | null;
  ein: string | null;
  notes: string | null;
}

interface W2HistoryRecord {
  id: string;
  yearId: string;
  taxYear: number;
  employerName: string | null;
  employerEIN: string | null;
  employerAddress: string | null;
  state: string | null;
  wages: number | null;
  federalTaxWithheld: number | null;
  socialSecurityWages: number | null;
  socialSecurityTax: number | null;
  medicareWages: number | null;
  medicareTax: number | null;
  stateWages: number | null;
  stateTaxWithheld: number | null;
  localWages: number | null;
  localTaxWithheld: number | null;
  netIncome: number | null;
  notes: string | null;
  createdAt: string;
}

interface IncomeYear {
  id: string;
  year: number;
  grossIncome: number;
  netIncome: number | null;
  jobCount: number;
  notes: string | null;
  entries: IncomeEntry[];
  w2Records: W2HistoryRecord[];
}

interface WageTier {
  id: string;
  label: string;
  hourlyRate: number;
  yearlyRate: number;
  sortOrder: number;
  color: string;
}

interface LiveEstimate {
  year: number;
  grossIncome: number;
  netIncome: number | null;
  company: string;
  role: string;
  breakdown: {
    basePay: number;
    ot1Pay: number;
    ot2Pay: number;
    diffPay: number;
    holidayPay: number;
    bonuses: number;
  };
  ytdGross: number | null;
}

interface CFMData {
  incomeYears: IncomeYear[];
  wageTiers: WageTier[];
  liveEstimate: LiveEstimate | null;
  paycheckTrackers: PaycheckTracker[];
}

interface PaycheckTracker {
  positionId: string;
  company: string;
  role: string;
  annualRaiseMin: number | null;
  annualRaiseMax: number | null;
  projectedGross: number;
  projectedYtd: number | null;
  actualYtd: number | null;
  latestPaycheck: {
    id: string;
    payPeriodEnd: string | null;
    grossPay: number | null;
    netPay: number | null;
    ytdGross: number | null;
    ytdNet: number | null;
    createdAt: string;
  } | null;
  paycheckHistory: PaycheckHistoryRecord[];
}

interface PaycheckHistoryRecord {
  id: string;
  payPeriodStart: string | null;
  payPeriodEnd: string | null;
  grossPay: number | null;
  netPay: number | null;
  payRate: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  ytdGross: number | null;
  ytdNet: number | null;
  ytdFederalTax: number | null;
  ytdStateTax: number | null;
  ytdSocialSec: number | null;
  ytdMedicare: number | null;
  ytdRetirement: number | null;
  ytdHealthIns: number | null;
  ytdTotalDed: number | null;
  taxPercentages: string | null;
  createdAt: string;
}

interface W2Parsed {
  taxYear: number | null;
  employerName: string | null;
  employerEIN: string | null;
  employerAddress: string | null;
  wages: number | null;
  federalTaxWithheld: number | null;
  socialSecurityWages: number | null;
  socialSecurityTax: number | null;
  medicareWages: number | null;
  medicareTax: number | null;
  stateTaxWithheld: number | null;
  stateWages: number | null;
  localTaxWithheld: number | null;
  localWages: number | null;
  state: string | null;
  rawText: string;
  cfmReady: {
    year: number | null;
    grossIncome: number | null;
    netIncome: number | null;
    notes: string;
  };
  companyData: {
    company: string | null;
    ein: string | null;
    address: string | null;
    state: string | null;
    year: number | null;
  };
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n.toLocaleString()}`;
const fmtFull = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtDollar = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

interface PaycheckParsed {
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
  percentages: {
    federalTax: number | null;
    stateTax: number | null;
    socialSecurity: number | null;
    medicare: number | null;
    retirement: number | null;
    healthInsurance: number | null;
    totalDeductions: number | null;
  };
  ytd: {
    grossPay: number | null;
    netPay: number | null;
    federalTax: number | null;
    stateTax: number | null;
    socialSecurity: number | null;
    medicare: number | null;
    retirement: number | null;
    healthInsurance: number | null;
    totalDeductions: number | null;
  };
}

const emptyIncomeForm = { year: "", grossIncome: "", netIncome: "", jobCount: "1", notes: "" };
const emptyTierForm = { label: "", hourlyRate: "", yearlyRate: "", color: "#6366f1" };

/* ── Main Page ── */

export default function CareerModelPage() {
  const queryClient = useQueryClient();
  const [incomeDialog, setIncomeDialog] = useState(false);
  const [tierDialog, setTierDialog] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeYear | null>(null);
  const [editingTier, setEditingTier] = useState<WageTier | null>(null);
  const [incomeForm, setIncomeForm] = useState(emptyIncomeForm);
  const [tierForm, setTierForm] = useState(emptyTierForm);
  const [w2Dialog, setW2Dialog] = useState(false);
  const [w2Uploading, setW2Uploading] = useState(false);
  const [w2Data, setW2Data] = useState<W2Parsed | null>(null);
  const [w2Form, setW2Form] = useState({ year: "", grossIncome: "", netIncome: "", jobCount: "1", notes: "" });
  const [w2AddEmployer, setW2AddEmployer] = useState(false);
  const [w2ShowRaw, setW2ShowRaw] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const w2InputRef = useRef<HTMLInputElement>(null);
  const paycheckInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [paycheckUploading, setPaycheckUploading] = useState<string | null>(null);
  // Paycheck parse preview state per position
  const [paycheckPreview, setPaycheckPreview] = useState<{
    positionId: string;
    data: PaycheckParsed;
  } | null>(null);
  // Paycheck history expand & edit state
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [editingPaycheck, setEditingPaycheck] = useState<PaycheckHistoryRecord | null>(null);
  const [editingW2, setEditingW2] = useState<W2HistoryRecord | null>(null);
  const [expandedW2Years, setExpandedW2Years] = useState<Set<number>>(new Set());
  const [showProjections, setShowProjections] = useState(false);
  const [projBaselineYears, setProjBaselineYears] = useState(3);
  const [projCapPct, setProjCapPct] = useState(15);

  const { data, isLoading } = useQuery<CFMData>({
    queryKey: ["cfm"],
    queryFn: () => fetch("/api/cfm").then((r) => r.json()),
  });

  const mutateCfm = useMutation({
    mutationFn: (args: { method: string; url: string; body?: unknown }) =>
      fetch(args.url, {
        method: args.method,
        headers: { "Content-Type": "application/json" },
        ...(args.body ? { body: JSON.stringify(args.body) } : {}),
      }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: { error?: string }) => {
      toast.error(err.error || "Operation failed");
    },
  });

  /* ── Computed ── */

  const incomeYears = data?.incomeYears ?? [];
  const wageTiers = data?.wageTiers ?? [];
  const liveEstimate = data?.liveEstimate ?? null;
  const paycheckTrackers = data?.paycheckTrackers ?? [];

  // Is the current year already manually entered?
  const currentYear = new Date().getFullYear();
  const hasManualCurrentYear = incomeYears.some((y) => y.year === currentYear);

  const yearlyChanges = useMemo(() => {
    return incomeYears.map((y, i) => {
      if (i === 0) return { ...y, grossChange: null, netChange: null };
      const prev = incomeYears[i - 1];
      const grossChange = prev.grossIncome > 0
        ? ((y.grossIncome - prev.grossIncome) / prev.grossIncome) * 100
        : null;
      const netChange = prev.netIncome && y.netIncome && prev.netIncome > 0
        ? ((y.netIncome - prev.netIncome) / prev.netIncome) * 100
        : null;
      return { ...y, grossChange, netChange };
    });
  }, [incomeYears]);

  // CAGR — Compound Annual Growth Rate (accounts for year gaps, much more stable than avg of YoY%)
  const avgGrossGrowth = useMemo(() => {
    if (incomeYears.length < 2) return 0;
    const first = incomeYears[0];
    const last = incomeYears[incomeYears.length - 1];
    if (first.grossIncome <= 0 || last.grossIncome <= 0) return 0;
    const span = last.year - first.year;
    if (span <= 0) return 0;
    return (Math.pow(last.grossIncome / first.grossIncome, 1 / span) - 1) * 100;
  }, [incomeYears]);

  const avgNetGrowth = useMemo(() => {
    if (incomeYears.length < 2) return 0;
    const first = incomeYears[0];
    const last = incomeYears[incomeYears.length - 1];
    if (!first.netIncome || !last.netIncome || first.netIncome <= 0 || last.netIncome <= 0) return 0;
    const span = last.year - first.year;
    if (span <= 0) return 0;
    return (Math.pow(last.netIncome / first.netIncome, 1 / span) - 1) * 100;
  }, [incomeYears]);

  const latestYear = incomeYears.length > 0 ? incomeYears[incomeYears.length - 1] : null;

  // effectiveLatest = live estimate for current year (if available and not manually overridden), else last manual entry
  const effectiveLatest = useMemo(() => {
    if (liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0) {
      return { year: liveEstimate.year, grossIncome: liveEstimate.grossIncome };
    }
    return latestYear ? { year: latestYear.year, grossIncome: latestYear.grossIncome } : null;
  }, [liveEstimate, hasManualCurrentYear, latestYear]);

  const projections = useMemo(() => {
    const empty = { conservative: [], realistic: [], optimistic: [], employerMin: [], employerMax: [], rates: { conservative: 4, realistic: 0, optimistic: 0, employerMin: 0, employerMax: 0 } };
    if (!effectiveLatest || incomeYears.length < 2) return empty;

    // Recent CAGR from last N years
    const windowSize = Math.min(projBaselineYears, incomeYears.length);
    const recentYears = incomeYears.slice(-windowSize);
    const first = recentYears[0];
    const last = recentYears[recentYears.length - 1];
    const span = last.year - first.year;
    let recentRate = 0;
    if (span > 0 && first.grossIncome > 0 && last.grossIncome > 0) {
      recentRate = (Math.pow(last.grossIncome / first.grossIncome, 1 / span) - 1) * 100;
    }

    const conservativeRate = 4; // National average
    const optimisticRate = Math.max(recentRate, 0);
    const realisticRate = Math.min(Math.max(recentRate, 0), projCapPct);

    // Employer-based raise range (weighted average across active positions with data)
    const trackersWithRaise = paycheckTrackers.filter((t) => t.annualRaiseMin != null && t.annualRaiseMax != null);
    let employerMinRate = 0;
    let employerMaxRate = 0;
    if (trackersWithRaise.length > 0) {
      const totalGross = trackersWithRaise.reduce((s, t) => s + t.projectedGross, 0);
      if (totalGross > 0) {
        employerMinRate = trackersWithRaise.reduce((s, t) => s + (t.annualRaiseMin! * t.projectedGross), 0) / totalGross;
        employerMaxRate = trackersWithRaise.reduce((s, t) => s + (t.annualRaiseMax! * t.projectedGross), 0) / totalGross;
      } else {
        employerMinRate = trackersWithRaise.reduce((s, t) => s + t.annualRaiseMin!, 0) / trackersWithRaise.length;
        employerMaxRate = trackersWithRaise.reduce((s, t) => s + t.annualRaiseMax!, 0) / trackersWithRaise.length;
      }
    }

    const rates = { conservative: conservativeRate, realistic: realisticRate, optimistic: optimisticRate, employerMin: employerMinRate, employerMax: employerMaxRate };

    const horizons = [1, 3, 5, 10];
    const calc = (rate: number) => horizons.map((years) => ({
      years,
      year: effectiveLatest.year + years,
      projected: effectiveLatest.grossIncome * Math.pow(1 + rate / 100, years),
    }));

    return {
      conservative: calc(conservativeRate),
      realistic: calc(realisticRate),
      optimistic: calc(optimisticRate),
      employerMin: employerMinRate > 0 ? calc(employerMinRate) : [],
      employerMax: employerMaxRate > 0 ? calc(employerMaxRate) : [],
      rates,
    };
  }, [effectiveLatest, incomeYears, projBaselineYears, projCapPct, paycheckTrackers]);

  const targetTier = wageTiers.length > 0 ? wageTiers[wageTiers.length - 1] : null;
  const timeToTarget = useMemo(() => {
    if (!effectiveLatest || !targetTier || projections.rates.realistic <= 0) return null;
    if (effectiveLatest.grossIncome >= targetTier.yearlyRate) return 0;
    const rate = projections.rates.realistic / 100;
    return Math.ceil(Math.log(targetTier.yearlyRate / effectiveLatest.grossIncome) / Math.log(1 + rate));
  }, [effectiveLatest, targetTier, projections.rates.realistic]);

  /* ── Chart Data ── */

  // Collect all unique employer names across all years (for stacked chart)
  const EMPLOYER_COLORS = [
    "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
    "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  ];

  const allEmployers = useMemo(() => {
    const names = new Set<string>();
    for (const y of incomeYears) {
      for (const e of y.entries) names.add(e.employer);
    }
    return Array.from(names);
  }, [incomeYears]);

  const hasAnyEntries = allEmployers.length > 0;

  // Stacked bar chart data: each year has a key per employer
  const stackedChartData = useMemo(() => {
    if (!hasAnyEntries) return [];
    return incomeYears.map((y) => {
      const point: Record<string, number | string> = { year: y.year };
      for (const e of y.entries) {
        const key = e.employer;
        point[key] = ((point[key] as number) || 0) + e.grossIncome;
      }
      // For years with no entries, fall back to total
      if (y.entries.length === 0 && y.grossIncome > 0) {
        point["Other"] = y.grossIncome;
      }
      return point;
    });
  }, [incomeYears, hasAnyEntries]);

  const stackedEmployers = useMemo(() => {
    if (!hasAnyEntries) return [];
    const names = new Set<string>();
    for (const pt of stackedChartData) {
      for (const key of Object.keys(pt)) {
        if (key !== "year") names.add(key);
      }
    }
    return Array.from(names);
  }, [stackedChartData, hasAnyEntries]);

  const chartData = useMemo(() => {
    type ChartPoint = { year: number; gross: number | null; net: number | null; conservative: number | null; realistic: number | null; optimistic: number | null; employerMin: number | null; employerMax: number | null; live: number | null };
    const actual: ChartPoint[] = incomeYears.map((y) => ({
      year: y.year,
      gross: y.grossIncome,
      net: y.netIncome,
      conservative: null,
      realistic: null,
      optimistic: null,
      employerMin: null,
      employerMax: null,
      live: null,
    }));

    // Add the live estimate point if it's for a year not already in manual data
    if (liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0) {
      actual.push({
        year: liveEstimate.year,
        gross: null,
        net: null,
        conservative: null,
        realistic: null,
        optimistic: null,
        employerMin: null,
        employerMax: null,
        live: liveEstimate.grossIncome,
      });
      actual.sort((a, b) => a.year - b.year);
    }

    if (showProjections && projections.realistic.length > 0 && effectiveLatest) {
      const base = effectiveLatest.grossIncome;
      const baseYear = effectiveLatest.year;
      const hasEmployer = projections.employerMin.length > 0;
      const scenarioPoints = [
        { year: baseYear, conservative: base, realistic: base, optimistic: base, employerMin: hasEmployer ? base : null, employerMax: hasEmployer ? base : null },
        ...projections.realistic.map((_, i) => ({
          year: projections.realistic[i].year,
          conservative: projections.conservative[i].projected,
          realistic: projections.realistic[i].projected,
          optimistic: projections.optimistic[i].projected,
          employerMin: hasEmployer ? projections.employerMin[i].projected : null,
          employerMax: hasEmployer ? projections.employerMax[i].projected : null,
        })),
      ];
      const allYears = new Set([...actual.map((a) => a.year), ...scenarioPoints.map((p) => p.year)]);
      return Array.from(allYears)
        .sort((a, b) => a - b)
        .map((year) => {
          const a = actual.find((x) => x.year === year);
          const p = scenarioPoints.find((x) => x.year === year);
          return {
            year,
            gross: a?.gross ?? null,
            net: a?.net ?? null,
            conservative: p?.conservative ?? null,
            realistic: p?.realistic ?? null,
            optimistic: p?.optimistic ?? null,
            employerMin: p?.employerMin ?? null,
            employerMax: p?.employerMax ?? null,
            live: a?.live ?? null,
          };
        });
    }
    return actual;
  }, [incomeYears, projections, effectiveLatest, liveEstimate, hasManualCurrentYear, showProjections]);

  /* ── Handlers ── */

  const openAddIncome = () => {
    setEditingIncome(null);
    setIncomeForm({
      ...emptyIncomeForm,
      year: latestYear ? String(latestYear.year + 1) : String(new Date().getFullYear()),
    });
    setIncomeDialog(true);
  };

  const openEditIncome = (y: IncomeYear) => {
    setEditingIncome(y);
    setIncomeForm({
      year: String(y.year),
      grossIncome: String(y.grossIncome),
      netIncome: y.netIncome ? String(y.netIncome) : "",
      jobCount: String(y.jobCount),
      notes: y.notes || "",
    });
    setIncomeDialog(true);
  };

  const saveIncome = () => {
    if (editingIncome) {
      mutateCfm.mutate(
        {
          method: "PATCH",
          url: `/api/cfm/${editingIncome.id}`,
          body: incomeForm,
        },
        { onSuccess: () => { setIncomeDialog(false); toast.success("Year updated"); } }
      );
    } else {
      mutateCfm.mutate(
        { method: "POST", url: "/api/cfm", body: incomeForm },
        { onSuccess: () => { setIncomeDialog(false); toast.success("Year added"); } }
      );
    }
  };

  const deleteIncome = (id: string) => {
    mutateCfm.mutate(
      { method: "DELETE", url: `/api/cfm/${id}` },
      { onSuccess: () => toast.success("Year deleted") }
    );
  };

  const openAddTier = () => {
    setEditingTier(null);
    setTierForm(emptyTierForm);
    setTierDialog(true);
  };

  const openEditTier = (t: WageTier) => {
    setEditingTier(t);
    setTierForm({
      label: t.label,
      hourlyRate: String(t.hourlyRate),
      yearlyRate: String(t.yearlyRate),
      color: t.color,
    });
    setTierDialog(true);
  };

  const saveTier = () => {
    if (editingTier) {
      mutateCfm.mutate(
        {
          method: "PATCH",
          url: `/api/cfm/${editingTier.id}`,
          body: { type: "tier", ...tierForm },
        },
        { onSuccess: () => { setTierDialog(false); toast.success("Tier updated"); } }
      );
    } else {
      mutateCfm.mutate(
        { method: "POST", url: "/api/cfm", body: { type: "tier", ...tierForm } },
        { onSuccess: () => { setTierDialog(false); toast.success("Tier added"); } }
      );
    }
  };

  const deleteTier = (id: string) => {
    mutateCfm.mutate(
      { method: "DELETE", url: `/api/cfm/${id}?type=tier` },
      { onSuccess: () => toast.success("Tier deleted") }
    );
  };

  /* ── W-2 Upload ── */

  const handleW2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset file input so re-uploading same file triggers change
    if (w2InputRef.current) w2InputRef.current.value = "";

    setW2Uploading(true);
    setW2Data(null);
    setW2Dialog(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/w2-parse", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to parse W-2");
        setW2Dialog(false);
        return;
      }
      setW2Data(json);
      setW2Form({
        year: json.cfmReady.year ? String(json.cfmReady.year) : "",
        grossIncome: json.cfmReady.grossIncome ? String(json.cfmReady.grossIncome) : "",
        netIncome: json.cfmReady.netIncome ? String(json.cfmReady.netIncome) : "",
        jobCount: "1",
        notes: json.cfmReady.notes || "",
      });
    } catch {
      toast.error("Failed to upload W-2");
      setW2Dialog(false);
    } finally {
      setW2Uploading(false);
    }
  };

  const confirmW2Import = async () => {
    // 1. Import the income year to CFM (includes employer for per-entry tracking)
    const cfmBody = {
      ...w2Form,
      employer: w2Data?.employerName || null,
      ein: w2Data?.employerEIN || null,
    };
    mutateCfm.mutate(
      { method: "POST", url: "/api/cfm", body: cfmBody },
      {
        onSuccess: async (yearRecord: IncomeYear) => {
          // 2. Save W-2 data as a persistent record
          try {
            await fetch("/api/w2-records", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                yearId: yearRecord.id,
                taxYear: parseInt(w2Form.year),
                employerName: w2Data?.employerName ?? null,
                employerEIN: w2Data?.employerEIN ?? null,
                employerAddress: w2Data?.employerAddress ?? null,
                state: w2Data?.state ?? null,
                wages: w2Data?.wages ?? null,
                federalTaxWithheld: w2Data?.federalTaxWithheld ?? null,
                socialSecurityWages: w2Data?.socialSecurityWages ?? null,
                socialSecurityTax: w2Data?.socialSecurityTax ?? null,
                medicareWages: w2Data?.medicareWages ?? null,
                medicareTax: w2Data?.medicareTax ?? null,
                stateWages: w2Data?.stateWages ?? null,
                stateTaxWithheld: w2Data?.stateTaxWithheld ?? null,
                localWages: w2Data?.localWages ?? null,
                localTaxWithheld: w2Data?.localTaxWithheld ?? null,
                netIncome: w2Form.netIncome ? parseFloat(w2Form.netIncome) : null,
                notes: w2Form.notes || null,
              }),
            });
            queryClient.invalidateQueries({ queryKey: ["cfm"] });
          } catch {
            // W-2 record save failed but income year was saved
          }

          // 3. Optionally add employer to employment history
          if (w2AddEmployer && w2Data?.companyData?.company) {
            try {
              const startYear = w2Data.companyData.year ?? new Date().getFullYear();
              await fetch("/api/current-position", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  company: w2Data.companyData.company,
                  role: "(from W-2)",
                  startDate: new Date(`${startYear}-01-01`).toISOString(),
                  endDate: new Date(`${startYear}-12-31`).toISOString(),
                  isActive: false,
                  salary: w2Data.wages ? Math.round(w2Data.wages) : undefined,
                  payType: "salary",
                  address: w2Data.companyData.address ?? undefined,
                  location: w2Data.companyData.state ?? undefined,
                  description: `Imported from ${startYear} W-2`,
                }),
              });
              queryClient.invalidateQueries({ queryKey: ["current-position"] });
              toast.success("Employer added to employment history");
            } catch {
              toast.error("Failed to add employer — income data was still imported");
            }
          }

          setW2Dialog(false);
          setW2Data(null);
          setW2AddEmployer(false);
          toast.success("W-2 data imported");
        },
      }
    );
  };

  /* Hourly ↔ Yearly sync */

  /* ── Paycheck Upload for YTD Tracking ── */

  const handlePaycheckUpload = async (positionId: string, file: File) => {
    setPaycheckUploading(positionId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/paycheck-parse", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to parse paycheck");
        return;
      }
      setPaycheckPreview({ positionId, data: json });
    } catch {
      toast.error("Failed to upload paycheck");
    } finally {
      setPaycheckUploading(null);
      const ref = paycheckInputRefs.current[positionId];
      if (ref) ref.value = "";
    }
  };

  const confirmPaycheckImport = async () => {
    if (!paycheckPreview) return;
    const { positionId, data: d } = paycheckPreview;
    try {
      const res = await fetch("/api/paycheck-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId,
          paycheck: {
            grossPay: d.grossPay,
            netPay: d.netPay,
            payRate: d.payRate,
            regularHours: d.regularHours,
            overtimeHours: d.overtimeHours,
            payPeriodStart: d.payPeriodStart,
            payPeriodEnd: d.payPeriodEnd,
          },
          ytd: d.ytd,
          percentages: d.percentages,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save paycheck record");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Paycheck imported — YTD updated");
    } catch {
      toast.error("Failed to save paycheck record");
    } finally {
      setPaycheckPreview(null);
    }
  };

  const updatePaycheckRecord = async (record: PaycheckHistoryRecord) => {
    try {
      const res = await fetch(`/api/paycheck-records/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossPay: record.grossPay,
          netPay: record.netPay,
          payRate: record.payRate,
          regularHours: record.regularHours,
          overtimeHours: record.overtimeHours,
          ytdGross: record.ytdGross,
          ytdNet: record.ytdNet,
          ytdFederalTax: record.ytdFederalTax,
          ytdStateTax: record.ytdStateTax,
          ytdSocialSec: record.ytdSocialSec,
          ytdMedicare: record.ytdMedicare,
          ytdRetirement: record.ytdRetirement,
          ytdHealthIns: record.ytdHealthIns,
          ytdTotalDed: record.ytdTotalDed,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update paycheck");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Paycheck record updated");
    } catch {
      toast.error("Failed to update paycheck");
    } finally {
      setEditingPaycheck(null);
    }
  };

  const deletePaycheckRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/paycheck-records/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to delete paycheck");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("Paycheck record deleted");
    } catch {
      toast.error("Failed to delete paycheck");
    }
  };

  const updateW2Record = async (record: W2HistoryRecord) => {
    try {
      const res = await fetch(`/api/w2-records/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerName: record.employerName,
          employerEIN: record.employerEIN,
          employerAddress: record.employerAddress,
          state: record.state,
          wages: record.wages,
          federalTaxWithheld: record.federalTaxWithheld,
          socialSecurityWages: record.socialSecurityWages,
          socialSecurityTax: record.socialSecurityTax,
          medicareWages: record.medicareWages,
          medicareTax: record.medicareTax,
          stateWages: record.stateWages,
          stateTaxWithheld: record.stateTaxWithheld,
          localWages: record.localWages,
          localTaxWithheld: record.localTaxWithheld,
          netIncome: record.netIncome,
          notes: record.notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update W-2 record");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("W-2 record updated");
    } catch {
      toast.error("Failed to update W-2 record");
    } finally {
      setEditingW2(null);
    }
  };

  const deleteW2Record = async (id: string) => {
    try {
      const res = await fetch(`/api/w2-records/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to delete W-2 record");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["cfm"] });
      toast.success("W-2 record deleted");
    } catch {
      toast.error("Failed to delete W-2 record");
    }
  };

  /* Hourly ↔ Yearly sync */
  const syncFromHourly = (hr: string) => {
    const h = parseFloat(hr);
    setTierForm({
      ...tierForm,
      hourlyRate: hr,
      yearlyRate: !isNaN(h) ? String(Math.round(h * 2080)) : tierForm.yearlyRate,
    });
  };

  const syncFromYearly = (yr: string) => {
    const y = parseFloat(yr);
    setTierForm({
      ...tierForm,
      yearlyRate: yr,
      hourlyRate: !isNaN(y) ? String(Math.round((y / 2080) * 100) / 100) : tierForm.hourlyRate,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6"><div className="h-24 bg-gray-200 rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Career Financial Model
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your income history, set wage goals, and project future earnings.
          </p>
        </div>
      </div>

      {/* ── Live Current Year Card ── */}
      {liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              {liveEstimate.year} Live Estimate
              <Badge variant="secondary" className="text-[10px] py-0">LIVE</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {liveEstimate.company} — {liveEstimate.role}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Projected Gross</p>
                <p className="text-xl font-bold">{fmtFull(liveEstimate.grossIncome)}</p>
              </div>
              {liveEstimate.netIncome !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">Projected Net</p>
                  <p className="text-xl font-bold">{fmtFull(liveEstimate.netIncome)}</p>
                </div>
              )}
              {liveEstimate.ytdGross !== null && (
                <div>
                  <p className="text-xs text-muted-foreground">YTD Gross</p>
                  <p className="text-xl font-bold">{fmtFull(liveEstimate.ytdGross)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {Math.round((liveEstimate.ytdGross / liveEstimate.grossIncome) * 100)}% of annual
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Breakdown</p>
                <div className="text-[11px] space-y-0.5 mt-0.5">
                  {liveEstimate.breakdown.basePay > 0 && <p>Base: {fmtFull(liveEstimate.breakdown.basePay)}</p>}
                  {liveEstimate.breakdown.ot1Pay > 0 && <p>OT: {fmtFull(liveEstimate.breakdown.ot1Pay)}</p>}
                  {liveEstimate.breakdown.ot2Pay > 0 && <p>OT2: {fmtFull(liveEstimate.breakdown.ot2Pay)}</p>}
                  {liveEstimate.breakdown.diffPay > 0 && <p>Diff: {fmtFull(liveEstimate.breakdown.diffPay)}</p>}
                  {liveEstimate.breakdown.holidayPay > 0 && <p>Holiday: {fmtFull(liveEstimate.breakdown.holidayPay)}</p>}
                  {liveEstimate.breakdown.bonuses > 0 && <p>Bonuses: {fmtFull(liveEstimate.breakdown.bonuses)}</p>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Paycheck YTD Tracker per Active Job ── */}
      {paycheckTrackers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              Paycheck YTD Tracker
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Upload a paycheck per active job to track actual YTD income vs projected.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {paycheckTrackers.map((tracker) => {
              const pctOfYear = tracker.projectedYtd && tracker.projectedGross > 0
                ? (tracker.projectedYtd / tracker.projectedGross) * 100
                : 0;
              const actualVsProjected = tracker.actualYtd && tracker.projectedYtd && tracker.projectedYtd > 0
                ? ((tracker.actualYtd - tracker.projectedYtd) / tracker.projectedYtd) * 100
                : null;
              const progressPct = tracker.actualYtd && tracker.projectedGross > 0
                ? Math.min(100, (tracker.actualYtd / tracker.projectedGross) * 100)
                : tracker.projectedYtd && tracker.projectedGross > 0
                  ? Math.min(100, (tracker.projectedYtd / tracker.projectedGross) * 100)
                  : 0;

              return (
                <div key={tracker.positionId} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{tracker.company}</p>
                      <p className="text-xs text-muted-foreground">{tracker.role}</p>
                    </div>
                    <div>
                      <input
                        ref={(el) => { paycheckInputRefs.current[tracker.positionId] = el; }}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePaycheckUpload(tracker.positionId, file);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={paycheckUploading === tracker.positionId}
                        onClick={() => paycheckInputRefs.current[tracker.positionId]?.click()}
                      >
                        {paycheckUploading === tracker.positionId ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Parsing...</>
                        ) : (
                          <><Upload className="h-3.5 w-3.5 mr-1" /> Upload Paycheck</>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-md bg-muted/40 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projected Annual</p>
                      <p className="text-lg font-bold font-mono">{fmtFull(tracker.projectedGross)}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-2.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected YTD</p>
                      <p className="text-lg font-bold font-mono">
                        {tracker.projectedYtd ? fmtFull(tracker.projectedYtd) : "—"}
                      </p>
                      {pctOfYear > 0 && (
                        <p className="text-[10px] text-muted-foreground">{pctOfYear.toFixed(0)}% of year elapsed</p>
                      )}
                    </div>
                    <div className={`rounded-md p-2.5 ${
                      tracker.actualYtd
                        ? actualVsProjected !== null && actualVsProjected >= 0
                          ? "bg-green-50 dark:bg-green-950/40"
                          : "bg-red-50 dark:bg-red-950/40"
                        : "bg-muted/40"
                    }`}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Actual YTD</p>
                      <p className="text-lg font-bold font-mono">
                        {tracker.actualYtd ? fmtFull(tracker.actualYtd) : "—"}
                      </p>
                      {actualVsProjected !== null && (
                        <p className={`text-[10px] font-medium ${actualVsProjected >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {actualVsProjected >= 0 ? "+" : ""}{actualVsProjected.toFixed(1)}% vs expected
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Annual Progress</span>
                      <span>{progressPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: tracker.actualYtd ? "#10b981" : "#3b82f6",
                        }}
                      />
                    </div>
                  </div>

                  {/* Last paycheck info */}
                  {tracker.latestPaycheck && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1 border-t">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span>
                        Last uploaded: {new Date(tracker.latestPaycheck.createdAt).toLocaleDateString()}
                        {tracker.latestPaycheck.grossPay && (
                          <> — Gross: <span className="font-mono font-medium">{fmtDollar(tracker.latestPaycheck.grossPay)}</span></>
                        )}
                        {tracker.latestPaycheck.netPay && (
                          <> · Net: <span className="font-mono font-medium">{fmtDollar(tracker.latestPaycheck.netPay)}</span></>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Paycheck history */}
                  {tracker.paycheckHistory.length > 0 && (
                    <div className="pt-1 border-t">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          const next = new Set(expandedHistory);
                          next.has(tracker.positionId) ? next.delete(tracker.positionId) : next.add(tracker.positionId);
                          setExpandedHistory(next);
                        }}
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedHistory.has(tracker.positionId) ? "rotate-180" : ""}`} />
                        Upload History ({tracker.paycheckHistory.length})
                      </button>

                      {expandedHistory.has(tracker.positionId) && (
                        <div className="mt-2 space-y-2">
                          {tracker.paycheckHistory.map((rec) => (
                            <div key={rec.id} className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  {rec.payPeriodEnd
                                    ? `Pay period ending ${new Date(rec.payPeriodEnd).toLocaleDateString()}`
                                    : `Uploaded ${new Date(rec.createdAt).toLocaleDateString()}`}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setEditingPaycheck({ ...rec })}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                                    onClick={() => deletePaycheckRecord(rec.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                                {rec.grossPay != null && (
                                  <div><span className="text-muted-foreground">Gross:</span> <span className="font-mono">{fmtDollar(rec.grossPay)}</span></div>
                                )}
                                {rec.netPay != null && (
                                  <div><span className="text-muted-foreground">Net:</span> <span className="font-mono">{fmtDollar(rec.netPay)}</span></div>
                                )}
                                {rec.ytdGross != null && (
                                  <div><span className="text-muted-foreground">YTD Gross:</span> <span className="font-mono font-semibold">{fmtDollar(rec.ytdGross)}</span></div>
                                )}
                                {rec.ytdNet != null && (
                                  <div><span className="text-muted-foreground">YTD Net:</span> <span className="font-mono">{fmtDollar(rec.ytdNet)}</span></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Overview Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Latest Gross</p>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">
              {latestYear ? fmtFull(latestYear.grossIncome) : "—"}
            </p>
            {latestYear && <p className="text-xs text-muted-foreground">{latestYear.year}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">CAGR (Gross)</p>
              {avgGrossGrowth >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
            <p className="text-2xl font-bold mt-1">
              {incomeYears.length >= 2 ? pct(avgGrossGrowth) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Compound annual growth</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Years Tracked</p>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">{incomeYears.length}</p>
            {incomeYears.length >= 2 && (
              <p className="text-xs text-muted-foreground">
                {incomeYears[0].year} – {incomeYears[incomeYears.length - 1].year}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Time to Target</p>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-1">
              {timeToTarget !== null
                ? timeToTarget === 0
                  ? "Reached!"
                  : `~${timeToTarget}yr`
                : "—"}
            </p>
            {targetTier && (
              <p className="text-xs text-muted-foreground">
                Target: {fmtFull(targetTier.yearlyRate)}/yr
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Income Growth Chart ── */}
      {chartData.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Income Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => fmt(v)} />
                <RechartsTooltip
                  formatter={(value, name) => [fmtFull(Number(value ?? 0)), name === "gross" ? "Gross" : name === "net" ? "Net" : name === "live" ? "Live Estimate" : name === "conservative" ? "Conservative" : name === "realistic" ? "Realistic" : name === "optimistic" ? "Optimistic" : name === "employerMin" ? "Employer Min" : name === "employerMax" ? "Employer Max" : String(name)]}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="gross"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#3b82f6" }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  name="gross"
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#10b981" }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  name="net"
                />
                {liveEstimate && !hasManualCurrentYear && (
                  <Line
                    type="monotone"
                    dataKey="live"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 5, fill: "#f59e0b", strokeWidth: 2 }}
                    activeDot={{ r: 7 }}
                    connectNulls={false}
                    name="live"
                  />
                )}
                {showProjections && projections.realistic.length > 0 && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="conservative"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                      name="conservative"
                    />
                    <Line
                      type="monotone"
                      dataKey="realistic"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={{ r: 3, fill: "#3b82f6" }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      name="realistic"
                    />
                    <Line
                      type="monotone"
                      dataKey="optimistic"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                      name="optimistic"
                    />
                    {projections.employerMin.length > 0 && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="employerMin"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          strokeDasharray="6 2"
                          dot={false}
                          connectNulls
                          name="employerMin"
                        />
                        <Line
                          type="monotone"
                          dataKey="employerMax"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          strokeDasharray="6 2"
                          dot={{ r: 3, fill: "#f59e0b" }}
                          activeDot={{ r: 5 }}
                          connectNulls
                          name="employerMax"
                        />
                      </>
                    )}
                  </>
                )}
                {wageTiers.map((t) => (
                  <ReferenceLine
                    key={t.id}
                    y={t.yearlyRate}
                    stroke={t.color}
                    strokeDasharray="4 4"
                    label={{ value: t.label, position: "right", fontSize: 11, fill: t.color }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded bg-blue-500" /> Gross Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded bg-emerald-500" /> Net Income (AGI)
              </span>
              {liveEstimate && !hasManualCurrentYear && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded bg-amber-500" /> Live Estimate
                </span>
              )}
              {showProjections && projections.realistic.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded bg-emerald-500 opacity-50" /> Conservative ({pct(projections.rates.conservative)})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded bg-blue-500 opacity-70" /> Realistic ({pct(projections.rates.realistic)})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded bg-purple-500 opacity-50" /> Optimistic ({pct(projections.rates.optimistic)})
                  </span>
                  {projections.employerMin.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-4 rounded bg-amber-500 opacity-70" /> Employer-Based ({pct(projections.rates.employerMin)}–{pct(projections.rates.employerMax)})
                    </span>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Employer Breakdown Chart (stacked bar) ── */}
      {hasAnyEntries && stackedChartData.length >= 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Income by Employer</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="year" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => fmt(v)} />
                <RechartsTooltip
                  formatter={(value) => [fmtFull(Number(value ?? 0))]}
                  labelFormatter={(label) => `Year ${label}`}
                />
                <Legend />
                {stackedEmployers.map((name, i) => (
                  <Bar
                    key={name}
                    dataKey={name}
                    stackId="income"
                    fill={EMPLOYER_COLORS[i % EMPLOYER_COLORS.length]}
                    name={name}
                  />
                ))}
                {wageTiers.map((t) => (
                  <ReferenceLine
                    key={t.id}
                    y={t.yearlyRate}
                    stroke={t.color}
                    strokeDasharray="4 4"
                    label={{ value: t.label, position: "right", fontSize: 11, fill: t.color }}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Two-Column Layout: Table + Tiers ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Income History Table */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Income History</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => w2InputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> Import W-2
                  </Button>
                  <Button size="sm" onClick={openAddIncome}>
                    <Plus className="h-4 w-4 mr-1" /> Add Year
                  </Button>
                  <input
                    ref={w2InputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleW2Upload}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {yearlyChanges.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No income data yet.</p>
                  <p className="text-xs mt-1">Add your first year to start building your career model.</p>
                  <Button size="sm" variant="outline" className="mt-4" onClick={openAddIncome}>
                    <Plus className="h-4 w-4 mr-1" /> Add Year
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Net (AGI)</TableHead>
                        <TableHead className="text-center">Jobs</TableHead>
                        <TableHead className="text-right">Gross %Δ</TableHead>
                        <TableHead className="text-right">Net %Δ</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearlyChanges.map((y) => {
                        const entries = y.entries ?? [];
                        const hasEntries = entries.length > 1;
                        const isExpanded = expandedYears.has(y.year);
                        const toggleExpand = () => {
                          setExpandedYears((prev) => {
                            const next = new Set(prev);
                            if (next.has(y.year)) next.delete(y.year);
                            else next.add(y.year);
                            return next;
                          });
                        };
                        return (
                          <>{/* Year summary row */}
                          <TableRow key={y.id}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-1">
                              {hasEntries && (
                                <button onClick={toggleExpand} className="p-0.5 rounded hover:bg-muted">
                                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                                </button>
                              )}
                              {y.year}
                              {entries.length === 1 && (
                                <span className="text-[10px] text-muted-foreground ml-1 truncate max-w-[120px]">
                                  {entries[0].employer}
                                </span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">{fmtFull(y.grossIncome)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {y.netIncome ? fmtFull(y.netIncome) : "—"}
                          </TableCell>
                          <TableCell className="text-center">{y.jobCount}</TableCell>
                          <TableCell className="text-right">
                            {y.grossChange !== null ? (
                              <Badge
                                variant="secondary"
                                className={
                                  y.grossChange >= 0
                                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                }
                              >
                                {pct(y.grossChange)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {y.netChange !== null ? (
                              <Badge
                                variant="secondary"
                                className={
                                  y.netChange >= 0
                                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                }
                              >
                                {pct(y.netChange)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <button
                                onClick={() => openEditIncome(y)}
                                className="p-1 rounded hover:bg-muted"
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => deleteIncome(y.id)}
                                className="p-1 rounded hover:bg-muted"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Employer sub-rows when expanded */}
                        {hasEntries && isExpanded && entries.map((entry, ei) => (
                          <TableRow key={entry.id} className="bg-muted/30">
                            <TableCell className="pl-8 text-xs text-muted-foreground">
                              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: EMPLOYER_COLORS[ei % EMPLOYER_COLORS.length] }} />
                              {entry.employer}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtFull(entry.grossIncome)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {entry.netIncome ? fmtFull(entry.netIncome) : "—"}
                            </TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                          </TableRow>
                        ))}
                        {/* W-2 record history */}
                        {y.w2Records && y.w2Records.length > 0 && (
                          <TableRow className="bg-blue-50/40 dark:bg-blue-950/20">
                            <TableCell colSpan={7} className="py-2 px-4">
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors font-medium"
                                onClick={() => {
                                  setExpandedW2Years((prev) => {
                                    const next = new Set(prev);
                                    next.has(y.year) ? next.delete(y.year) : next.add(y.year);
                                    return next;
                                  });
                                }}
                              >
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedW2Years.has(y.year) ? "rotate-180" : ""}`} />
                                W-2 Records ({y.w2Records.length})
                              </button>
                              {expandedW2Years.has(y.year) && (
                                <div className="mt-2 space-y-2">
                                  {y.w2Records.map((w2) => (
                                    <div key={w2.id} className="rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-2.5 text-xs space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium text-blue-700 dark:text-blue-300">
                                          {w2.employerName || "Unknown Employer"}
                                          {w2.employerEIN && <span className="text-muted-foreground ml-1.5">EIN: {w2.employerEIN}</span>}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingW2({ ...w2 })}>
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-600" onClick={() => deleteW2Record(w2.id)}>
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                                        {w2.wages != null && (
                                          <div><span className="text-muted-foreground">Box 1 Wages:</span> <span className="font-mono">{fmtDollar(w2.wages)}</span></div>
                                        )}
                                        {w2.federalTaxWithheld != null && (
                                          <div><span className="text-muted-foreground">Box 2 Fed Tax:</span> <span className="font-mono">{fmtDollar(w2.federalTaxWithheld)}</span></div>
                                        )}
                                        {w2.socialSecurityWages != null && (
                                          <div><span className="text-muted-foreground">Box 3 SS Wages:</span> <span className="font-mono">{fmtDollar(w2.socialSecurityWages)}</span></div>
                                        )}
                                        {w2.socialSecurityTax != null && (
                                          <div><span className="text-muted-foreground">Box 4 SS Tax:</span> <span className="font-mono">{fmtDollar(w2.socialSecurityTax)}</span></div>
                                        )}
                                        {w2.medicareWages != null && (
                                          <div><span className="text-muted-foreground">Box 5 Med Wages:</span> <span className="font-mono">{fmtDollar(w2.medicareWages)}</span></div>
                                        )}
                                        {w2.medicareTax != null && (
                                          <div><span className="text-muted-foreground">Box 6 Med Tax:</span> <span className="font-mono">{fmtDollar(w2.medicareTax)}</span></div>
                                        )}
                                        {w2.stateWages != null && (
                                          <div><span className="text-muted-foreground">Box 16 State Wages:</span> <span className="font-mono">{fmtDollar(w2.stateWages)}</span></div>
                                        )}
                                        {w2.stateTaxWithheld != null && (
                                          <div><span className="text-muted-foreground">Box 17 State Tax:</span> <span className="font-mono">{fmtDollar(w2.stateTaxWithheld)}</span></div>
                                        )}
                                        {w2.localWages != null && (
                                          <div><span className="text-muted-foreground">Box 18 Local Wages:</span> <span className="font-mono">{fmtDollar(w2.localWages)}</span></div>
                                        )}
                                        {w2.localTaxWithheld != null && (
                                          <div><span className="text-muted-foreground">Box 19 Local Tax:</span> <span className="font-mono">{fmtDollar(w2.localTaxWithheld)}</span></div>
                                        )}
                                        {w2.netIncome != null && (
                                          <div><span className="text-muted-foreground">Net Income:</span> <span className="font-mono font-semibold">{fmtDollar(w2.netIncome)}</span></div>
                                        )}
                                        {w2.state && (
                                          <div><span className="text-muted-foreground">State:</span> <span>{w2.state}</span></div>
                                        )}
                                      </div>
                                      {w2.notes && (
                                        <p className="text-muted-foreground italic">{w2.notes}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                        </>);
                      })}
                      {/* Live estimate row */}
                      {liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0 && (
                        <TableRow className="bg-amber-50/60 dark:bg-amber-950/30 border-dashed border-amber-300 dark:border-amber-700">
                          <TableCell className="font-medium">
                            {liveEstimate.year}
                            <Badge variant="secondary" className="ml-2 text-[10px] py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">LIVE</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono italic">{fmtFull(liveEstimate.grossIncome)}</TableCell>
                          <TableCell className="text-right font-mono italic">
                            {liveEstimate.netIncome ? fmtFull(liveEstimate.netIncome) : "—"}
                          </TableCell>
                          <TableCell className="text-center">1</TableCell>
                          <TableCell className="text-right">
                            {latestYear ? (
                              <Badge
                                variant="secondary"
                                className={
                                  liveEstimate.grossIncome >= latestYear.grossIncome
                                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                }
                              >
                                {pct(((liveEstimate.grossIncome - latestYear.grossIncome) / latestYear.grossIncome) * 100)}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {latestYear?.netIncome && liveEstimate.netIncome ? (
                              <Badge
                                variant="secondary"
                                className={
                                  liveEstimate.netIncome >= latestYear.netIncome
                                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                }
                              >
                                {pct(((liveEstimate.netIncome - latestYear.netIncome) / latestYear.netIncome) * 100)}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="text-[10px] text-muted-foreground italic">auto</span>
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Average row */}
                      {yearlyChanges.length >= 2 && (
                        <TableRow className="bg-muted/40 font-medium">
                          <TableCell colSpan={4} className="text-sm">CAGR</TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              {pct(avgGrossGrowth)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {avgNetGrowth !== 0 ? (
                              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {pct(avgNetGrowth)}
                              </Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Projections toggle + explanation + controls */}
          {incomeYears.length >= 2 && (
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-600" />
                      Income Projections
                      <Badge variant="secondary" className="text-[10px] py-0 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">Experimental</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Projections extrapolate future income from your history. Early career shifts, part-time
                      years, and career changes distort growth rates. Three scenarios are shown — conservative
                      (national avg ~4%), realistic (your recent growth, capped), and optimistic (uncapped).
                      If you&apos;ve set annual raise ranges on your positions, an Employer-Based band is also shown.
                      Adjust the baseline window and growth cap to explore different assumptions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5 shrink-0">
                    <Label htmlFor="projections-toggle" className="text-xs text-muted-foreground">Show</Label>
                    <Switch id="projections-toggle" checked={showProjections} onCheckedChange={setShowProjections} />
                  </div>
                </div>

                {showProjections && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-1 border-t border-amber-200 dark:border-amber-800">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Baseline Window</Label>
                        <span className="text-xs font-mono font-medium">
                          {projBaselineYears >= incomeYears.length ? "All years" : `Last ${projBaselineYears} yr${projBaselineYears > 1 ? "s" : ""}`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={incomeYears.length}
                        value={projBaselineYears}
                        onChange={(e) => setProjBaselineYears(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-600 bg-muted"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        How many recent years to use for growth calculation
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Realistic Growth Cap</Label>
                        <span className="text-xs font-mono font-medium">{projCapPct}%</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={50}
                        value={projCapPct}
                        onChange={(e) => setProjCapPct(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-blue-600 bg-muted"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Max annual growth for the &quot;Realistic&quot; scenario
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Scenario Projections */}
          {showProjections && projections.realistic.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  Income Projections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Based on {projBaselineYears >= incomeYears.length ? "all" : `last ${projBaselineYears}`} years of data,
                  capped at {projCapPct}% for realistic scenario
                </p>
                <div className="space-y-2">
                  {[1, 3, 5, 10].map((horizon, hi) => (
                    <div key={horizon} className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        In {horizon} year{horizon > 1 ? "s" : ""} ({effectiveLatest!.year + horizon})
                      </p>
                      <div className={`grid gap-3 ${projections.employerMin.length > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
                        {projections.employerMin.length > 0 && (
                          <div className="space-y-0.5">
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Employer ({pct(projections.rates.employerMin)}–{pct(projections.rates.employerMax)})</p>
                            <p className="text-sm font-bold font-mono">
                              {fmtFull(Math.round((projections.employerMin[hi].projected + projections.employerMax[hi].projected) / 2))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtFull(Math.round(projections.employerMin[hi].projected))} – {fmtFull(Math.round(projections.employerMax[hi].projected))}
                            </p>
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Conservative ({pct(projections.rates.conservative)})</p>
                          <p className="text-sm font-bold font-mono">{fmtFull(Math.round(projections.conservative[hi].projected))}</p>
                          <p className="text-[10px] text-muted-foreground">{fmt(Math.round(projections.conservative[hi].projected / 12))}/mo</p>
                        </div>
                        <div className={`space-y-0.5 ${projections.employerMin.length > 0 ? "" : "border-x px-3"}`}>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Realistic ({pct(projections.rates.realistic)})</p>
                          <p className="text-sm font-bold font-mono">{fmtFull(Math.round(projections.realistic[hi].projected))}</p>
                          <p className="text-[10px] text-muted-foreground">{fmt(Math.round(projections.realistic[hi].projected / 12))}/mo</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Optimistic ({pct(projections.rates.optimistic)})</p>
                          <p className="text-sm font-bold font-mono">{fmtFull(Math.round(projections.optimistic[hi].projected))}</p>
                          <p className="text-[10px] text-muted-foreground">{fmt(Math.round(projections.optimistic[hi].projected / 12))}/mo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Wage Tiers Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Wage Goals</CardTitle>
                <Button size="sm" variant="outline" onClick={openAddTier}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {wageTiers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">Set your wage targets</p>
                  <p className="text-xs mt-1">e.g. Short-Term, Long-Term, Target</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {wageTiers.map((t) => {
                    const currentGross = effectiveLatest?.grossIncome ?? 0;
                    const progress = currentGross > 0
                      ? Math.min(100, (currentGross / t.yearlyRate) * 100)
                      : 0;
                    const reached = currentGross >= t.yearlyRate;

                    return (
                      <div key={t.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            <span className="text-sm font-medium">{t.label}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEditTier(t)} className="p-1 rounded hover:bg-muted">
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => deleteTier(t.id)} className="p-1 rounded hover:bg-muted">
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-mono">${t.hourlyRate}/hr</span>
                          <span className="font-mono">{fmtFull(t.yearlyRate)}/yr</span>
                        </div>
                        {effectiveLatest && (
                          <>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${progress}%`,
                                  backgroundColor: reached ? "#22c55e" : t.color,
                                }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground text-right">
                              {reached ? (
                                <span className="text-green-600 font-medium">Reached ✓</span>
                              ) : (
                                `${progress.toFixed(0)}% — ${fmtFull(t.yearlyRate - currentGross)} to go`
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time-to-Target Card */}
          {showProjections && targetTier && effectiveLatest && timeToTarget !== null && timeToTarget > 0 && (
            <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/50">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-purple-600" />
                  Time to Target
                </p>
                <p className="text-xs text-muted-foreground">
                  At {pct(projections.rates.realistic)}/yr (realistic), you&apos;ll reach{" "}
                  <span className="font-medium">{targetTier.label}</span> ({fmtFull(targetTier.yearlyRate)}/yr)
                  in approximately:
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    ~{timeToTarget} year{timeToTarget > 1 ? "s" : ""}
                  </p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{effectiveLatest.year + timeToTarget}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Add/Edit Income Year Dialog ── */}
      <Dialog open={incomeDialog} onOpenChange={setIncomeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingIncome ? "Edit Year" : "Add Income Year"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Year</Label>
                <Input
                  type="number"
                  placeholder="2024"
                  value={incomeForm.year}
                  onChange={(e) => setIncomeForm({ ...incomeForm, year: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1"># of Jobs</Label>
                <Input
                  type="number"
                  placeholder="1"
                  value={incomeForm.jobCount}
                  onChange={(e) => setIncomeForm({ ...incomeForm, jobCount: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Gross Income</Label>
                <Input
                  type="number"
                  placeholder="60000"
                  value={incomeForm.grossIncome}
                  onChange={(e) => setIncomeForm({ ...incomeForm, grossIncome: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Net Income (AGI)</Label>
                <Input
                  type="number"
                  placeholder="45000"
                  value={incomeForm.netIncome}
                  onChange={(e) => setIncomeForm({ ...incomeForm, netIncome: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1">Notes (optional)</Label>
              <Input
                placeholder="e.g. Switched jobs mid-year, got a raise..."
                value={incomeForm.notes}
                onChange={(e) => setIncomeForm({ ...incomeForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIncomeDialog(false)}>Cancel</Button>
              <Button onClick={saveIncome} disabled={!incomeForm.year || !incomeForm.grossIncome}>
                {editingIncome ? "Update" : "Add Year"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── W-2 Import Review Dialog ── */}
      <Dialog open={w2Dialog} onOpenChange={(open) => { if (!open) { setW2Dialog(false); setW2Data(null); setW2AddEmployer(false); setW2ShowRaw(false); } }}>        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Import W-2
            </DialogTitle>
          </DialogHeader>
          {w2Uploading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Extracting W-2 data...</p>
            </div>
          ) : w2Data ? (() => {
            // Helpers to update w2Data fields in-place
            const updW2 = (key: keyof W2Parsed, raw: string) => {
              const v = raw === "" ? null : parseFloat(raw);
              setW2Data({ ...w2Data, [key]: isNaN(v as number) ? null : v });
            };
            const updW2Str = (key: keyof W2Parsed, val: string) => {
              setW2Data({ ...w2Data, [key]: val || null });
            };
            const updCompany = (key: keyof W2Parsed["companyData"], val: string) => {
              setW2Data({ ...w2Data, companyData: { ...w2Data.companyData, [key]: val || null } });
            };

            // Editable number input row (same pattern as paycheck dialog)
            const numRow = (label: string, value: number | null | undefined, onChange: (v: string) => void, prefix = "$") => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <div className="flex items-center gap-1">
                  {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
                  <Input
                    type="number"
                    step="0.01"
                    className="h-6 text-xs font-mono px-1 py-0"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              </>
            );

            // Editable text input row
            const textRow = (label: string, value: string | null | undefined, onChange: (v: string) => void) => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <Input
                  className="h-6 text-xs px-1 py-0"
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                />
              </>
            );

            return (
            <div className="space-y-4 pt-2">
              <p className="text-[10px] text-muted-foreground italic">All fields are editable — adjust any values before saving.</p>

              {/* Employer Info */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium">Employer Info</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                  {textRow("Employer", w2Data.employerName, (v) => { updW2Str("employerName", v); updCompany("company", v); })}
                  {textRow("EIN", w2Data.employerEIN, (v) => { updW2Str("employerEIN", v); updCompany("ein", v); })}
                  {textRow("Address", w2Data.employerAddress, (v) => { updW2Str("employerAddress", v); updCompany("address", v); })}
                  {textRow("State", w2Data.state, (v) => { updW2Str("state", v); updCompany("state", v); })}
                </div>
              </div>

              {/* W-2 Box Values */}
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50 p-3 space-y-2">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">W-2 Box Values</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                  {numRow("Box 1 (Wages)", w2Data.wages, (v) => {
                    updW2("wages", v);
                    setW2Form((f) => ({ ...f, grossIncome: v }));
                  })}
                  {numRow("Box 2 (Fed Tax)", w2Data.federalTaxWithheld, (v) => updW2("federalTaxWithheld", v))}
                  {numRow("Box 3 (SS Wages)", w2Data.socialSecurityWages, (v) => updW2("socialSecurityWages", v))}
                  {numRow("Box 4 (SS Tax)", w2Data.socialSecurityTax, (v) => updW2("socialSecurityTax", v))}
                  {numRow("Box 5 (Medicare Wages)", w2Data.medicareWages, (v) => updW2("medicareWages", v))}
                  {numRow("Box 6 (Medicare Tax)", w2Data.medicareTax, (v) => updW2("medicareTax", v))}
                </div>
                <Separator className="my-1" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                  {numRow("Box 16 (State Wages)", w2Data.stateWages, (v) => updW2("stateWages", v))}
                  {numRow("Box 17 (State Tax)", w2Data.stateTaxWithheld, (v) => updW2("stateTaxWithheld", v))}
                  {numRow("Box 18 (Local Wages)", w2Data.localWages, (v) => updW2("localWages", v))}
                  {numRow("Box 19 (Local Tax)", w2Data.localTaxWithheld, (v) => updW2("localTaxWithheld", v))}
                </div>
              </div>

              {/* Import Summary */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/50 p-3 space-y-2">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Import Summary</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                  {numRow("Year", w2Data.taxYear, (v) => {
                    updW2("taxYear", v);
                    setW2Form((f) => ({ ...f, year: v }));
                  }, "")}
                  {numRow("# of Jobs", parseInt(w2Form.jobCount) || 1, (v) => setW2Form((f) => ({ ...f, jobCount: v || "1" })), "")}
                  {numRow("Gross Income", parseFloat(w2Form.grossIncome) || null, (v) => setW2Form((f) => ({ ...f, grossIncome: v })))}
                  {numRow("Net Income", parseFloat(w2Form.netIncome) || null, (v) => setW2Form((f) => ({ ...f, netIncome: v })))}
                </div>
                <div className="pt-1">
                  <label className="text-muted-foreground text-xs">Notes</label>
                  <Input
                    className="h-6 text-xs px-1 py-0 mt-0.5"
                    value={w2Form.notes}
                    onChange={(e) => setW2Form({ ...w2Form, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Raw Text Debug Viewer */}
              {w2Data.rawText && (
                <div className="rounded-lg border bg-muted/20 text-xs">
                  <button
                    type="button"
                    className="flex items-center justify-between w-full px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setW2ShowRaw(!w2ShowRaw)}
                  >
                    <span>Raw Extracted Text</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${w2ShowRaw ? "rotate-180" : ""}`} />
                  </button>
                  {w2ShowRaw && (
                    <pre className="px-3 pb-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted-foreground border-t">
                      {w2Data.rawText}
                    </pre>
                  )}
                </div>
              )}

              {/* Add Employer to Employment History */}
              {w2Data.companyData?.company && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Add to Employment History?</p>
                      <p className="text-xs text-muted-foreground">
                        Save <span className="font-medium">{w2Data.companyData.company}</span> as a past position in your work history.
                      </p>
                    </div>
                    <Switch checked={w2AddEmployer} onCheckedChange={setW2AddEmployer} />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setW2Dialog(false); setW2Data(null); setW2AddEmployer(false); setW2ShowRaw(false); }}>Cancel</Button>
                <Button onClick={confirmW2Import} disabled={!w2Form.year || !w2Form.grossIncome}>
                  {w2AddEmployer ? "Import Year & Add Employer" : "Import Year"}
                </Button>
              </div>
            </div>);
          })() : null}
        </DialogContent>
      </Dialog>

      {/* ── Paycheck Preview / Confirm Dialog ── */}
      <Dialog open={!!paycheckPreview} onOpenChange={(open) => { if (!open) setPaycheckPreview(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              Review Paycheck Data
            </DialogTitle>
          </DialogHeader>
          {paycheckPreview && (() => {
            const d = paycheckPreview.data;
            const tracker = paycheckTrackers.find((t) => t.positionId === paycheckPreview.positionId);

            // Helper: update a top-level field
            const upd = (key: keyof PaycheckParsed, raw: string) => {
              const v = raw === "" ? null : parseFloat(raw);
              setPaycheckPreview({ ...paycheckPreview, data: { ...d, [key]: isNaN(v as number) ? null : v } });
            };
            // Helper: update a YTD field
            const updYtd = (key: keyof PaycheckParsed["ytd"], raw: string) => {
              const v = raw === "" ? null : parseFloat(raw);
              setPaycheckPreview({ ...paycheckPreview, data: { ...d, ytd: { ...d.ytd, [key]: isNaN(v as number) ? null : v } } });
            };

            // Editable number input row
            const numRow = (label: string, value: number | null | undefined, onChange: (v: string) => void, prefix = "$") => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <div className="flex items-center gap-1">
                  {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
                  <Input
                    type="number"
                    step="0.01"
                    className="h-6 text-xs font-mono px-1 py-0"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              </>
            );

            return (
              <div className="space-y-4 pt-2">
                {tracker && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{tracker.company}</span> — {tracker.role}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground italic">All fields are editable — adjust any values before saving.</p>

                {/* This Period */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">This Period</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("Gross Pay", d.grossPay, (v) => upd("grossPay", v))}
                    {numRow("Net Pay", d.netPay, (v) => upd("netPay", v))}
                    {numRow("Pay Rate", d.payRate, (v) => upd("payRate", v))}
                    {numRow("Regular Hours", d.regularHours, (v) => upd("regularHours", v), "")}
                    {numRow("OT Hours", d.overtimeHours, (v) => upd("overtimeHours", v), "")}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("Federal Tax", d.federalTax, (v) => upd("federalTax", v))}
                    {numRow("State Tax", d.stateTax, (v) => upd("stateTax", v))}
                    {numRow("Social Security", d.socialSecurity, (v) => upd("socialSecurity", v))}
                    {numRow("Medicare", d.medicare, (v) => upd("medicare", v))}
                    {numRow("Retirement", d.retirement, (v) => upd("retirement", v))}
                    {numRow("Health Ins", d.healthInsurance, (v) => upd("healthInsurance", v))}
                  </div>
                </div>

                {/* Year to Date */}
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Year to Date</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("YTD Gross", d.ytd.grossPay, (v) => updYtd("grossPay", v))}
                    {numRow("YTD Net", d.ytd.netPay, (v) => updYtd("netPay", v))}
                    {numRow("YTD Federal Tax", d.ytd.federalTax, (v) => updYtd("federalTax", v))}
                    {numRow("YTD State Tax", d.ytd.stateTax, (v) => updYtd("stateTax", v))}
                    {numRow("YTD Social Security", d.ytd.socialSecurity, (v) => updYtd("socialSecurity", v))}
                    {numRow("YTD Medicare", d.ytd.medicare, (v) => updYtd("medicare", v))}
                    {numRow("YTD Retirement", d.ytd.retirement, (v) => updYtd("retirement", v))}
                    {numRow("YTD Health Ins", d.ytd.healthInsurance, (v) => updYtd("healthInsurance", v))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPaycheckPreview(null)}>Cancel</Button>
                  <Button onClick={confirmPaycheckImport}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Save &amp; Track
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit Existing Paycheck Record Dialog ── */}
      <Dialog open={!!editingPaycheck} onOpenChange={(open) => { if (!open) setEditingPaycheck(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit Paycheck Record
            </DialogTitle>
          </DialogHeader>
          {editingPaycheck && (() => {
            const rec = editingPaycheck;

            const updRec = (key: keyof PaycheckHistoryRecord, raw: string) => {
              const v = raw === "" ? null : parseFloat(raw);
              setEditingPaycheck({ ...rec, [key]: isNaN(v as number) ? null : v });
            };

            const numRow = (label: string, value: number | null | undefined, onChange: (v: string) => void, prefix = "$") => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <div className="flex items-center gap-1">
                  {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
                  <Input
                    type="number"
                    step="0.01"
                    className="h-6 text-xs font-mono px-1 py-0"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              </>
            );

            return (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  {rec.payPeriodEnd
                    ? `Pay period ending ${new Date(rec.payPeriodEnd).toLocaleDateString()}`
                    : `Uploaded ${new Date(rec.createdAt).toLocaleDateString()}`}
                </p>

                {/* This Period */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">This Period</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("Gross Pay", rec.grossPay, (v) => updRec("grossPay", v))}
                    {numRow("Net Pay", rec.netPay, (v) => updRec("netPay", v))}
                    {numRow("Pay Rate", rec.payRate, (v) => updRec("payRate", v))}
                    {numRow("Regular Hours", rec.regularHours, (v) => updRec("regularHours", v), "")}
                    {numRow("OT Hours", rec.overtimeHours, (v) => updRec("overtimeHours", v), "")}
                  </div>
                </div>

                {/* Year to Date */}
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Year to Date</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("YTD Gross", rec.ytdGross, (v) => updRec("ytdGross", v))}
                    {numRow("YTD Net", rec.ytdNet, (v) => updRec("ytdNet", v))}
                    {numRow("YTD Federal Tax", rec.ytdFederalTax, (v) => updRec("ytdFederalTax", v))}
                    {numRow("YTD State Tax", rec.ytdStateTax, (v) => updRec("ytdStateTax", v))}
                    {numRow("YTD Social Security", rec.ytdSocialSec, (v) => updRec("ytdSocialSec", v))}
                    {numRow("YTD Medicare", rec.ytdMedicare, (v) => updRec("ytdMedicare", v))}
                    {numRow("YTD Retirement", rec.ytdRetirement, (v) => updRec("ytdRetirement", v))}
                    {numRow("YTD Health Ins", rec.ytdHealthIns, (v) => updRec("ytdHealthIns", v))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingPaycheck(null)}>Cancel</Button>
                  <Button onClick={() => updatePaycheckRecord(rec)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Save Changes
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit W-2 Record Dialog ── */}
      <Dialog open={!!editingW2} onOpenChange={(open) => { if (!open) setEditingW2(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit W-2 Record
            </DialogTitle>
          </DialogHeader>
          {editingW2 && (() => {
            const rec = editingW2;

            const updNum = (key: keyof W2HistoryRecord, raw: string) => {
              const v = raw === "" ? null : parseFloat(raw);
              setEditingW2({ ...rec, [key]: isNaN(v as number) ? null : v } as W2HistoryRecord);
            };

            const updStr = (key: keyof W2HistoryRecord, raw: string) => {
              setEditingW2({ ...rec, [key]: raw || null } as W2HistoryRecord);
            };

            const numRow = (label: string, value: number | null | undefined, onChange: (v: string) => void, prefix = "$") => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <div className="flex items-center gap-1">
                  {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
                  <Input
                    type="number"
                    step="0.01"
                    className="h-6 text-xs font-mono px-1 py-0"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                  />
                </div>
              </>
            );

            const textRow = (label: string, value: string | null | undefined, onChange: (v: string) => void) => (
              <>
                <label className="text-muted-foreground text-xs">{label}</label>
                <Input
                  className="h-6 text-xs px-1 py-0"
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                />
              </>
            );

            return (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-muted-foreground">
                  Tax Year {rec.taxYear} — Uploaded {new Date(rec.createdAt).toLocaleDateString()}
                </p>

                {/* Employer Info */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-medium">Employer Info</p>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs items-center">
                    {textRow("Employer Name", rec.employerName, (v) => updStr("employerName", v))}
                    {textRow("EIN", rec.employerEIN, (v) => updStr("employerEIN", v))}
                    {textRow("Address", rec.employerAddress, (v) => updStr("employerAddress", v))}
                    {textRow("State", rec.state, (v) => updStr("state", v))}
                  </div>
                </div>

                {/* W-2 Box Values */}
                <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300">W-2 Box Values</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("Box 1 — Wages", rec.wages, (v) => updNum("wages", v))}
                    {numRow("Box 2 — Fed Tax", rec.federalTaxWithheld, (v) => updNum("federalTaxWithheld", v))}
                    {numRow("Box 3 — SS Wages", rec.socialSecurityWages, (v) => updNum("socialSecurityWages", v))}
                    {numRow("Box 4 — SS Tax", rec.socialSecurityTax, (v) => updNum("socialSecurityTax", v))}
                    {numRow("Box 5 — Med Wages", rec.medicareWages, (v) => updNum("medicareWages", v))}
                    {numRow("Box 6 — Med Tax", rec.medicareTax, (v) => updNum("medicareTax", v))}
                    {numRow("Box 16 — State Wages", rec.stateWages, (v) => updNum("stateWages", v))}
                    {numRow("Box 17 — State Tax", rec.stateTaxWithheld, (v) => updNum("stateTaxWithheld", v))}
                    {numRow("Box 18 — Local Wages", rec.localWages, (v) => updNum("localWages", v))}
                    {numRow("Box 19 — Local Tax", rec.localTaxWithheld, (v) => updNum("localTaxWithheld", v))}
                  </div>
                </div>

                {/* Summary */}
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
                    {numRow("Net Income", rec.netIncome, (v) => updNum("netIncome", v))}
                    <>
                      <label className="text-muted-foreground text-xs">Notes</label>
                      <Input
                        className="h-6 text-xs px-1 py-0"
                        value={rec.notes ?? ""}
                        onChange={(e) => updStr("notes", e.target.value)}
                      />
                    </>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setEditingW2(null)}>Cancel</Button>
                  <Button onClick={() => updateW2Record(rec)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Save Changes
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Wage Tier Dialog ── */}
      <Dialog open={tierDialog} onOpenChange={setTierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? "Edit Wage Tier" : "Add Wage Tier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Label</Label>
                <Input
                  placeholder="e.g. Short-Term, Target"
                  value={tierForm.label}
                  onChange={(e) => setTierForm({ ...tierForm, label: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1">Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={tierForm.color}
                    onChange={(e) => setTierForm({ ...tierForm, color: e.target.value })}
                    className="h-9 w-12 rounded border cursor-pointer"
                  />
                  <Input
                    value={tierForm.color}
                    onChange={(e) => setTierForm({ ...tierForm, color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-1">Hourly Rate</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="35.00"
                  value={tierForm.hourlyRate}
                  onChange={(e) => syncFromHourly(e.target.value)}
                />
              </div>
              <div>
                <Label className="mb-1">Yearly Rate</Label>
                <Input
                  type="number"
                  placeholder="72800"
                  value={tierForm.yearlyRate}
                  onChange={(e) => syncFromYearly(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Hourly ↔ Yearly auto-syncs using 2,080 hours/year (40hrs × 52wks)
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setTierDialog(false)}>Cancel</Button>
              <Button onClick={saveTier} disabled={!tierForm.label || !tierForm.hourlyRate || !tierForm.yearlyRate}>
                {editingTier ? "Update" : "Add Tier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

interface IncomeYear {
  id: string;
  year: number;
  grossIncome: number;
  netIncome: number | null;
  jobCount: number;
  notes: string | null;
  entries: IncomeEntry[];
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
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

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

  const avgGrossGrowth = useMemo(() => {
    const changes = yearlyChanges
      .map((y) => y.grossChange)
      .filter((c): c is number => c !== null);
    return changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  }, [yearlyChanges]);

  const avgNetGrowth = useMemo(() => {
    const changes = yearlyChanges
      .map((y) => y.netChange)
      .filter((c): c is number => c !== null);
    return changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  }, [yearlyChanges]);

  const latestYear = incomeYears.length > 0 ? incomeYears[incomeYears.length - 1] : null;

  // effectiveLatest = live estimate for current year (if available and not manually overridden), else last manual entry
  const effectiveLatest = useMemo(() => {
    if (liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0) {
      return { year: liveEstimate.year, grossIncome: liveEstimate.grossIncome };
    }
    return latestYear ? { year: latestYear.year, grossIncome: latestYear.grossIncome } : null;
  }, [liveEstimate, hasManualCurrentYear, latestYear]);

  const projections = useMemo(() => {
    if (!effectiveLatest || avgGrossGrowth === 0) return [];
    const rate = avgGrossGrowth / 100;
    // Start projections from the year after effectiveLatest
    return [1, 3, 5, 10].map((years) => {
      const projected = effectiveLatest.grossIncome * Math.pow(1 + rate, years);
      return { years, year: effectiveLatest.year + years, projected };
    });
  }, [effectiveLatest, avgGrossGrowth]);

  const targetTier = wageTiers.length > 0 ? wageTiers[wageTiers.length - 1] : null;
  const timeToTarget = useMemo(() => {
    if (!effectiveLatest || !targetTier || avgGrossGrowth <= 0) return null;
    if (effectiveLatest.grossIncome >= targetTier.yearlyRate) return 0;
    const rate = avgGrossGrowth / 100;
    return Math.ceil(Math.log(targetTier.yearlyRate / effectiveLatest.grossIncome) / Math.log(1 + rate));
  }, [effectiveLatest, targetTier, avgGrossGrowth]);

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
    type ChartPoint = { year: number; gross: number | null; net: number | null; projected: number | null; live: number | null };
    const actual: ChartPoint[] = incomeYears.map((y) => ({
      year: y.year,
      gross: y.grossIncome,
      net: y.netIncome,
      projected: null,
      live: null,
    }));

    // Add the live estimate point if it's for a year not already in manual data
    if (liveEstimate && !hasManualCurrentYear && liveEstimate.grossIncome > 0) {
      actual.push({
        year: liveEstimate.year,
        gross: null,
        net: null,
        projected: null,
        live: liveEstimate.grossIncome,
      });
      actual.sort((a, b) => a.year - b.year);
    }

    if (projections.length > 0 && effectiveLatest) {
      const projected = [
        { year: effectiveLatest.year, projected: effectiveLatest.grossIncome },
        ...projections.map((p) => ({ year: p.year, projected: p.projected })),
      ];
      const allYears = new Set([...actual.map((a) => a.year), ...projected.map((p) => p.year)]);
      return Array.from(allYears)
        .sort((a, b) => a - b)
        .map((year) => {
          const a = actual.find((x) => x.year === year);
          const p = projected.find((x) => x.year === year);
          return {
            year,
            gross: a?.gross ?? null,
            net: a?.net ?? null,
            projected: p?.projected ?? null,
            live: a?.live ?? null,
          };
        });
    }
    return actual;
  }, [incomeYears, projections, effectiveLatest, liveEstimate, hasManualCurrentYear]);

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
        onSuccess: async () => {
          // 2. Optionally add employer to employment history
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
              <p className="text-sm text-muted-foreground">Avg Growth (Gross)</p>
              {avgGrossGrowth >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </div>
            <p className="text-2xl font-bold mt-1">
              {incomeYears.length >= 2 ? pct(avgGrossGrowth) : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Year over year</p>
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
                  formatter={(value, name) => [fmtFull(Number(value ?? 0)), name === "gross" ? "Gross" : name === "net" ? "Net" : name === "live" ? "Live Estimate" : "Projected"]}
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
                {projections.length > 0 && (
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke="#a855f7"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={{ r: 3, fill: "#a855f7" }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    name="projected"
                  />
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
              {projections.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded bg-purple-500 opacity-60" /> Projected
                </span>
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
                          <TableCell colSpan={4} className="text-sm">Average</TableCell>
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

          {/* Projections */}
          {projections.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  Income Projections
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Based on your average gross growth rate of {pct(avgGrossGrowth)}/yr
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {projections.map((p) => (
                    <div
                      key={p.years}
                      className="rounded-lg border p-3 space-y-1"
                    >
                      <p className="text-xs text-muted-foreground">
                        In {p.years} year{p.years > 1 ? "s" : ""} ({p.year})
                      </p>
                      <p className="text-lg font-bold">{fmtFull(Math.round(p.projected))}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(Math.round(p.projected / 12))}/mo
                      </p>
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
          {targetTier && effectiveLatest && timeToTarget !== null && timeToTarget > 0 && (
            <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/50">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-purple-600" />
                  Time to Target
                </p>
                <p className="text-xs text-muted-foreground">
                  At your current growth rate of {pct(avgGrossGrowth)}/yr, you&apos;ll reach{" "}
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
          ) : w2Data ? (
            <div className="space-y-4 pt-2">
              {/* Extraction Summary */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <p className="font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" /> Extracted Data
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {w2Data.employerName && (
                    <><span className="text-muted-foreground">Employer</span><span>{w2Data.employerName}</span></>
                  )}
                  {w2Data.employerEIN && (
                    <><span className="text-muted-foreground">EIN</span><span>{w2Data.employerEIN}</span></>
                  )}
                  {w2Data.employerAddress && (
                    <><span className="text-muted-foreground">Address</span><span>{w2Data.employerAddress}</span></>
                  )}
                  {w2Data.state && (
                    <><span className="text-muted-foreground">State</span><span>{w2Data.state}</span></>
                  )}
                  {w2Data.taxYear && (
                    <><span className="text-muted-foreground">Tax Year</span><span>{w2Data.taxYear}</span></>
                  )}
                </div>
                <Separator className="my-1" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {w2Data.wages != null && (
                    <><span className="text-muted-foreground">Box 1 (Wages)</span><span className="font-mono">${w2Data.wages.toLocaleString()}</span></>
                  )}
                  {w2Data.federalTaxWithheld != null && (
                    <><span className="text-muted-foreground">Box 2 (Fed Tax)</span><span className="font-mono">${w2Data.federalTaxWithheld.toLocaleString()}</span></>
                  )}
                  {w2Data.socialSecurityWages != null && (
                    <><span className="text-muted-foreground">Box 3 (SS Wages)</span><span className="font-mono">${w2Data.socialSecurityWages.toLocaleString()}</span></>
                  )}
                  {w2Data.socialSecurityTax != null && (
                    <><span className="text-muted-foreground">Box 4 (SS Tax)</span><span className="font-mono">${w2Data.socialSecurityTax.toLocaleString()}</span></>
                  )}
                  {w2Data.medicareWages != null && (
                    <><span className="text-muted-foreground">Box 5 (Medicare Wages)</span><span className="font-mono">${w2Data.medicareWages.toLocaleString()}</span></>
                  )}
                  {w2Data.medicareTax != null && (
                    <><span className="text-muted-foreground">Box 6 (Medicare Tax)</span><span className="font-mono">${w2Data.medicareTax.toLocaleString()}</span></>
                  )}
                  {w2Data.stateWages != null && (
                    <><span className="text-muted-foreground">Box 16 (State Wages)</span><span className="font-mono">${w2Data.stateWages.toLocaleString()}</span></>
                  )}
                  {w2Data.stateTaxWithheld != null && (
                    <><span className="text-muted-foreground">Box 17 (State Tax)</span><span className="font-mono">${w2Data.stateTaxWithheld.toLocaleString()}</span></>
                  )}
                  {w2Data.localWages != null && (
                    <><span className="text-muted-foreground">Box 18 (Local Wages)</span><span className="font-mono">${w2Data.localWages.toLocaleString()}</span></>
                  )}
                  {w2Data.localTaxWithheld != null && (
                    <><span className="text-muted-foreground">Box 19 (Local Tax)</span><span className="font-mono">${w2Data.localTaxWithheld.toLocaleString()}</span></>
                  )}
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

              {/* Warn if key fields are missing */}
              {(!w2Data.wages || !w2Data.taxYear) && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950 p-3 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-yellow-700 dark:text-yellow-300">
                    Some fields couldn&apos;t be extracted automatically. Please verify and fill in the values below before importing.
                  </p>
                </div>
              )}

              {/* Editable Import Form */}
              <Separator />
              <p className="text-xs text-muted-foreground">Review and adjust before importing:</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1">Year</Label>
                  <Input
                    type="number"
                    value={w2Form.year}
                    onChange={(e) => setW2Form({ ...w2Form, year: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1"># of Jobs</Label>
                  <Input
                    type="number"
                    value={w2Form.jobCount}
                    onChange={(e) => setW2Form({ ...w2Form, jobCount: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1">Gross Income (Box 1)</Label>
                  <Input
                    type="number"
                    value={w2Form.grossIncome}
                    onChange={(e) => setW2Form({ ...w2Form, grossIncome: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1">Net Income (after taxes)</Label>
                  <Input
                    type="number"
                    value={w2Form.netIncome}
                    onChange={(e) => setW2Form({ ...w2Form, netIncome: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1">Notes</Label>
                <Input
                  value={w2Form.notes}
                  onChange={(e) => setW2Form({ ...w2Form, notes: e.target.value })}
                />
              </div>

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
            </div>
          ) : null}
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

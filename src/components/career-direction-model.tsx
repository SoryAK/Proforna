"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Camera,
  Compass,
  Target,
  ChevronDown,
  AlertTriangle,
  MoreHorizontal,
  TrendingUp,
  ArrowRight,
  BookOpen,
  Lightbulb,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ResponsiveRadar } from "@nivo/radar";

/* ── Types ── */

interface PathMilestone {
  id?: string;
  title: string;
  description?: string | null;
  isRequired: boolean;
  sortOrder: number;
}

interface CareerPath {
  id: string;
  title: string;
  description: string | null;
  targetRole: string | null;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
  industry: string | null;
  level: string;
  requiredSkills: string | null;
  timelineYears: number | null;
  isActive: boolean;
  sortOrder: number;
  milestones: PathMilestone[];
  _count: { scores: number };
}

interface DirectionScore {
  id: string;
  skillMatch: number;
  incomeAlignment: number;
  goalAlignment: number;
  overallScore: number;
  gaps: string | null;
  path: { id: string; title: string };
}

interface CareerSnapshot {
  id: string;
  capturedAt: string;
  totalSkills: number;
  avgProficiency: number;
  incomeGross: number | null;
  activeGoals: number;
  completedGoals: number;
  certCount: number;
  applicationsOpen: number;
  currentRole: string | null;
  currentCompany: string | null;
  overallScore: number | null;
  scores: DirectionScore[];
}

interface RequiredSkill {
  name: string;
  proficiency: string;
}

interface Gap {
  type: string;
  name: string;
  detail: string;
}

interface SkillSuggestionItem {
  skill: string;
  detail: string;
  hasLearning: boolean;
  inProgressCount: number;
  completedCount: number;
  existingItems: {
    id: string;
    title: string;
    status: string;
    progress: number;
    provider: string | null;
  }[];
}

interface PathSuggestion {
  pathId: string;
  pathTitle: string;
  skillMatch: number;
  items: SkillSuggestionItem[];
}

/* ── CDM Decomposition Types ── */

interface CDMDomain {
  id: string;
  name: string;
  keySkills: string[];
  socCodes: string[];
}

interface CDMCombination {
  id: string;
  roles: string[];
  socCodes: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  level: string;
  domains: CDMDomain[];
}

interface CDMTree {
  id: string;
  targetRole: string;
  targetSocCode: string | null;
  pathId: string | null;
  combinations: CDMCombination[];
  createdAt: string;
}

interface CDMSynonym {
  title: string;
  frequency: string;
  regionBias: string | null;
}

interface CDMSynonymCluster {
  id: string;
  canonicalTitle: string;
  synonyms: CDMSynonym[];
  socCodes: string[];
  skillOverlap: number;
}

/* ── Constants ── */

const LEVELS = [
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid-Level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "executive", label: "Executive" },
];

const PROFICIENCY_OPTIONS = ["beginner", "intermediate", "advanced", "expert"];

const scoreColor = (score: number) => {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
};

const scoreBg = (score: number) => {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
};

const emptyPathForm = {
  title: "",
  description: "",
  targetRole: "",
  targetSalaryMin: "",
  targetSalaryMax: "",
  industry: "",
  level: "mid",
  timelineYears: "",
  requiredSkills: [] as RequiredSkill[],
  milestones: [] as { title: string; description: string; isRequired: boolean }[],
};

/* ── BLS Wage Comparison Sub-Component ── */

function buildBLSSeriesId(occCode: string, dataTypeCode: string, area = "0000000"): string {
  const occ = occCode.replace("-", "");
  return `OEUM${area}${occ}${dataTypeCode}`;
}

function BLSWageComparison({
  targetRole,
  targetSalaryMin,
  targetSalaryMax,
}: {
  targetRole: string;
  targetSalaryMin: number | null;
  targetSalaryMax: number | null;
}) {
  const [occCode, setOccCode] = useState<string | null>(null);
  const [occTitle, setOccTitle] = useState<string | null>(null);

  // Search for occupation code matching targetRole
  const { data: occupations } = useQuery<{ code: string; title: string; group: string }[]>({
    queryKey: ["occ-search", targetRole],
    queryFn: () =>
      fetch(`/api/market-research/occupations?q=${encodeURIComponent(targetRole)}`)
        .then((r) => r.json()),
    enabled: targetRole.length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select best match
  useEffect(() => {
    if (occupations && occupations.length > 0 && !occCode) {
      setOccCode(occupations[0].code);
      setOccTitle(occupations[0].title);
    }
  }, [occupations, occCode]);

  // Fetch BLS median wage (data type 13)
  const { data: blsData, isLoading: blsLoading } = useQuery<{
    series: { seriesId: string; data: { year: string; period: string; value: number | null }[] }[];
  }>({
    queryKey: ["bls-cdm-wage", occCode],
    queryFn: () => {
      const seriesId = buildBLSSeriesId(occCode!, "13");
      const year = new Date().getFullYear();
      return fetch(
        `/api/market-research/bls?series=${seriesId}&startyear=${year - 1}&endyear=${year}`
      ).then((r) => r.json());
    },
    enabled: !!occCode,
    staleTime: 10 * 60 * 1000,
  });

  // Extract annual median (period M13)
  const medianWage = blsData?.series?.[0]?.data?.find(
    (d) => d.period === "M13" && d.value !== null
  )?.value;

  if (blsLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        <DollarSign className="h-3 w-3 animate-pulse" /> Loading market data...
      </div>
    );
  }

  if (!medianWage) return null;

  const targetMid =
    targetSalaryMin && targetSalaryMax
      ? (targetSalaryMin + targetSalaryMax) / 2
      : targetSalaryMin ?? targetSalaryMax ?? 0;

  const diff = targetMid > 0 ? ((targetMid - medianWage) / medianWage) * 100 : 0;
  const isAbove = diff > 5;
  const isBelow = diff < -5;

  return (
    <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <DollarSign className="h-3 w-3" /> BLS Market Comparison
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">BLS Median</span>
        <span className="font-semibold">${medianWage.toLocaleString()}/yr</span>
      </div>
      {targetMid > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Your Target</span>
          <span className="font-semibold">${targetMid.toLocaleString()}/yr</span>
        </div>
      )}
      {targetMid > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground truncate" title={occTitle ?? undefined}>
            SOC: {occTitle ?? occCode}
          </span>
          <Badge
            className={`text-[10px] ${
              isAbove
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : isBelow
                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {diff > 0 ? "+" : ""}
            {diff.toFixed(0)}% vs market
          </Badge>
        </div>
      )}
    </div>
  );
}

/* ── Component ── */

export default function CareerDirectionModel() {
  const queryClient = useQueryClient();
  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPathForm);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [decomposingPathId, setDecomposingPathId] = useState<string | null>(null);
  const [synonymLoadingTitle, setSynonymLoadingTitle] = useState<string | null>(null);

  // ── Data fetching ──
  const { data: paths = [], isLoading: pathsLoading } = useQuery<CareerPath[]>({
    queryKey: ["career-paths"],
    queryFn: () => fetch("/api/career-paths").then((r) => r.json()),
  });

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery<CareerSnapshot[]>({
    queryKey: ["career-snapshots"],
    queryFn: () => fetch("/api/career-snapshots").then((r) => r.json()),
  });

  const { data: suggestions = [] } = useQuery<PathSuggestion[]>({
    queryKey: ["skill-gap-suggestions"],
    queryFn: () => fetch("/api/skill-gap-suggestions").then((r) => r.json()),
    enabled: snapshots.length > 0,
  });

  // CDM: Decomposition trees & synonym clusters
  const { data: cdmTrees = [] } = useQuery<CDMTree[]>({
    queryKey: ["cdm-trees"],
    queryFn: () => fetch("/api/cdm/decompose").then((r) => r.json()),
  });

  const { data: synonymClusters = [] } = useQuery<CDMSynonymCluster[]>({
    queryKey: ["cdm-synonyms"],
    queryFn: () => fetch("/api/cdm/synonyms").then((r) => r.json()),
  });

  const decomposeMutation = useMutation({
    mutationFn: async ({ targetRole, pathId }: { targetRole: string; pathId: string }) => {
      const res = await fetch("/api/cdm/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, pathId }),
      });
      if (!res.ok) throw new Error("Decomposition failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cdm-trees"] });
      setDecomposingPathId(null);
      toast.success("Skill tree generated!");
    },
    onError: () => {
      setDecomposingPathId(null);
      toast.error("Failed to decompose role — try again");
    },
  });

  const synonymMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/cdm/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Synonym generation failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cdm-synonyms"] });
      setSynonymLoadingTitle(null);
      toast.success("Title synonyms found!");
    },
    onError: () => {
      setSynonymLoadingTitle(null);
      toast.error("Failed to find synonyms — try again");
    },
  });

  function handleDecompose(path: CareerPath) {
    if (!path.targetRole) return;
    setDecomposingPathId(path.id);
    decomposeMutation.mutate({ targetRole: path.targetRole, pathId: path.id });
  }

  function handleSynonyms(title: string) {
    setSynonymLoadingTitle(title);
    synonymMutation.mutate(title);
  }

  const latestSnapshot = snapshots[0] ?? null;

  // ── Mutations ──
  const savePathMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const url = editingPathId
        ? `/api/career-paths/${editingPathId}`
        : "/api/career-paths";
      const res = await fetch(url, {
        method: editingPathId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-paths"] });
      toast.success(editingPathId ? "Path updated" : "Path created");
      closePathDialog();
    },
    onError: () => toast.error("Failed to save"),
  });

  const deletePathMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/career-paths/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-paths"] });
      toast.success("Path deleted");
    },
  });

  const captureSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/career-snapshots", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["career-snapshots"] });
      toast.success("Snapshot captured — scores updated!");
    },
    onError: () => toast.error("Failed to capture snapshot"),
  });

  // ── Form helpers ──
  function closePathDialog() {
    setPathDialogOpen(false);
    setEditingPathId(null);
    setForm(emptyPathForm);
  }

  function openEditPath(p: CareerPath) {
    setEditingPathId(p.id);
    const skills: RequiredSkill[] = p.requiredSkills
      ? JSON.parse(p.requiredSkills)
      : [];
    setForm({
      title: p.title,
      description: p.description || "",
      targetRole: p.targetRole || "",
      targetSalaryMin: p.targetSalaryMin?.toString() || "",
      targetSalaryMax: p.targetSalaryMax?.toString() || "",
      industry: p.industry || "",
      level: p.level,
      timelineYears: p.timelineYears?.toString() || "",
      requiredSkills: skills,
      milestones: p.milestones.map((m) => ({
        title: m.title,
        description: m.description || "",
        isRequired: m.isRequired,
      })),
    });
    setPathDialogOpen(true);
  }

  function handlePathSubmit(e: React.FormEvent) {
    e.preventDefault();
    savePathMutation.mutate({
      title: form.title,
      description: form.description || null,
      targetRole: form.targetRole || null,
      targetSalaryMin: form.targetSalaryMin ? parseInt(form.targetSalaryMin) : null,
      targetSalaryMax: form.targetSalaryMax ? parseInt(form.targetSalaryMax) : null,
      industry: form.industry || null,
      level: form.level,
      timelineYears: form.timelineYears ? parseInt(form.timelineYears) : null,
      requiredSkills: form.requiredSkills.length > 0 ? form.requiredSkills : null,
      milestones: form.milestones,
    });
  }

  function addSkillReq() {
    setForm({
      ...form,
      requiredSkills: [...form.requiredSkills, { name: "", proficiency: "intermediate" }],
    });
  }

  function removeSkillReq(idx: number) {
    setForm({
      ...form,
      requiredSkills: form.requiredSkills.filter((_, i) => i !== idx),
    });
  }

  function updateSkillReq(idx: number, field: keyof RequiredSkill, value: string) {
    const next = [...form.requiredSkills];
    next[idx] = { ...next[idx], [field]: value };
    setForm({ ...form, requiredSkills: next });
  }

  function addMilestone() {
    setForm({
      ...form,
      milestones: [...form.milestones, { title: "", description: "", isRequired: false }],
    });
  }

  function removeMilestone(idx: number) {
    setForm({
      ...form,
      milestones: form.milestones.filter((_, i) => i !== idx),
    });
  }

  // ── Render ──
  if (pathsLoading || snapshotsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-indigo-500" />
          <h2 className="text-lg font-semibold">Career Directional Model</h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => captureSnapshotMutation.mutate()}
            disabled={captureSnapshotMutation.isPending || paths.length === 0}
          >
            <Camera className="mr-2 h-4 w-4" />
            {captureSnapshotMutation.isPending ? "Capturing..." : "Capture Snapshot"}
          </Button>
          <Button size="sm" onClick={() => setPathDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Path
          </Button>
        </div>
      </div>

      {/* Overall Score Banner */}
      {latestSnapshot && (
        <Card className="border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/30 dark:to-gray-900">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <p className={`text-3xl font-bold ${scoreColor(latestSnapshot.overallScore ?? 0)}`}>
                  {Math.round(latestSnapshot.overallScore ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">Overall Score</p>
              </div>
              <Separator orientation="vertical" className="h-10 hidden sm:block" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Skills</p>
                  <p className="font-semibold">{latestSnapshot.totalSkills} tracked</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Avg Proficiency</p>
                  <p className="font-semibold">{Math.round(latestSnapshot.avgProficiency)}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Goals</p>
                  <p className="font-semibold">
                    {latestSnapshot.completedGoals} done · {latestSnapshot.activeGoals} active
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Certs</p>
                  <p className="font-semibold">{latestSnapshot.certCount}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Snapshot: {format(new Date(latestSnapshot.capturedAt), "MMM d, yyyy h:mm a")}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {paths.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Compass className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Define Your Career Directions</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Add career paths you&apos;re considering — like &quot;Staff Engineer&quot;,
              &quot;Engineering Manager&quot;, or &quot;CTO&quot;. The CDM will score how aligned
              your current skills, income, and goals are with each direction.
            </p>
            <Button onClick={() => setPathDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Your First Path
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Career Paths with Scores */}
      {paths.length > 0 && (
        <>
        {/* Skill Radar Chart – paths with scores */}
        {(() => {
          const radarData = latestSnapshot?.scores
            .map((s) => ({
              dimension: "Skills",
              [s.path.title]: Math.round(s.skillMatch),
            }))
            .length
            ? [
                Object.assign(
                  { dimension: "Skills" },
                  ...latestSnapshot!.scores.map((s) => ({
                    [s.path.title]: Math.round(s.skillMatch),
                  }))
                ),
                Object.assign(
                  { dimension: "Income" },
                  ...latestSnapshot!.scores.map((s) => ({
                    [s.path.title]: Math.round(s.incomeAlignment),
                  }))
                ),
                Object.assign(
                  { dimension: "Goals" },
                  ...latestSnapshot!.scores.map((s) => ({
                    [s.path.title]: Math.round(s.goalAlignment),
                  }))
                ),
              ]
            : null;
          const radarKeys = latestSnapshot?.scores.map((s) => s.path.title) ?? [];

          if (!radarData || radarKeys.length === 0) return null;

          return (
            <Card className="mb-3">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-indigo-500" />
                  Path Alignment Radar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveRadar
                    data={radarData}
                    keys={radarKeys}
                    indexBy="dimension"
                    maxValue={100}
                    margin={{ top: 32, right: 80, bottom: 32, left: 80 }}
                    curve="linearClosed"
                    borderWidth={2}
                    gridLevels={4}
                    gridShape="circular"
                    dotSize={6}
                    dotBorderWidth={1}
                    colors={["#e8740c", "#6366f1", "#10b981", "#f59e0b", "#ef4444"]}
                    fillOpacity={0.15}
                    blendMode="normal"
                    legends={[
                      {
                        anchor: "top-left",
                        direction: "column",
                        translateX: -60,
                        translateY: -20,
                        itemWidth: 80,
                        itemHeight: 16,
                        itemTextColor: "#888",
                        symbolSize: 10,
                        symbolShape: "circle",
                      },
                    ]}
                    theme={{
                      text: { fontSize: 11, fill: "#888" },
                      grid: { line: { stroke: "#e5e7eb", strokeWidth: 1 } },
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <div className="space-y-3">
          {paths.map((path) => {
            const score = latestSnapshot?.scores.find((s) => s.path.id === path.id);
            const gaps: Gap[] = score?.gaps ? JSON.parse(score.gaps) : [];
            const isExpanded = expandedPath === path.id;

            return (
              <Card key={path.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <button
                      className="flex items-start gap-3 text-left flex-1 min-w-0"
                      onClick={() => setExpandedPath(isExpanded ? null : path.id)}
                    >
                      <Target className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <CardTitle className="text-base">{path.title}</CardTitle>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {path.targetRole && (
                            <Badge variant="secondary" className="text-xs">
                              {path.targetRole}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs capitalize">
                            {path.level}
                          </Badge>
                          {path.targetSalaryMin && (
                            <Badge variant="outline" className="text-xs">
                              ${path.targetSalaryMin.toLocaleString()}
                              {path.targetSalaryMax ? `–$${path.targetSalaryMax.toLocaleString()}` : "+"}
                            </Badge>
                          )}
                          {path.timelineYears && (
                            <Badge variant="outline" className="text-xs">
                              ~{path.timelineYears}yr timeline
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 shrink-0 mt-1 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      {score && (
                        <span className={`text-xl font-bold ${scoreColor(score.overallScore)}`}>
                          {Math.round(score.overallScore)}
                        </span>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditPath(path)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deletePathMutation.mutate(path.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                {/* Score bars */}
                {score && (
                  <CardContent className="pt-0 pb-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Skills</span>
                          <span className="font-medium">{Math.round(score.skillMatch)}%</span>
                        </div>
                        <Progress value={score.skillMatch} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Income</span>
                          <span className="font-medium">{Math.round(score.incomeAlignment)}%</span>
                        </div>
                        <Progress value={score.incomeAlignment} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Goals</span>
                          <span className="font-medium">{Math.round(score.goalAlignment)}%</span>
                        </div>
                        <Progress value={score.goalAlignment} className="h-1.5" />
                      </div>
                    </div>
                  </CardContent>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    <div className="pt-3 space-y-4">
                      {path.description && (
                        <p className="text-sm text-muted-foreground">{path.description}</p>
                      )}

                      {/* Required Skills */}
                      {path.requiredSkills && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Required Skills
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {(JSON.parse(path.requiredSkills) as RequiredSkill[]).map((s) => {
                              const hasGap = gaps.some(
                                (g) => g.type === "skill" && g.name.toLowerCase() === s.name.toLowerCase()
                              );
                              return (
                                <Badge
                                  key={s.name}
                                  variant={hasGap ? "destructive" : "secondary"}
                                  className="text-xs"
                                >
                                  {s.name}
                                  <span className="ml-1 opacity-60 capitalize">{s.proficiency}</span>
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Milestones */}
                      {path.milestones.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                            Milestones
                          </h4>
                          <div className="space-y-1">
                            {path.milestones.map((m) => (
                              <div key={m.title} className="flex items-center gap-2 text-sm">
                                <ArrowRight className="h-3 w-3 text-indigo-400 shrink-0" />
                                <span>{m.title}</span>
                                {m.isRequired && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Required
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CDM: Title Synonyms */}
                      {(() => {
                        const cluster = path.targetRole
                          ? synonymClusters.find(
                              (c) => c.canonicalTitle.toLowerCase() === path.targetRole!.toLowerCase()
                            )
                          : null;
                        if (cluster) {
                          return (
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" /> Also Known As
                                <Badge variant="outline" className="text-[10px] ml-auto">
                                  {cluster.skillOverlap}% skill overlap
                                </Badge>
                              </h4>
                              <div className="flex flex-wrap gap-1.5">
                                {cluster.synonyms.map((s) => (
                                  <Badge
                                    key={s.title}
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {s.title}
                                    {s.frequency !== "common" && (
                                      <span className="ml-1 opacity-50 capitalize">({s.frequency})</span>
                                    )}
                                    {s.regionBias && (
                                      <span className="ml-1 opacity-50">· {s.regionBias}</span>
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        if (path.targetRole) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSynonyms(path.targetRole!)}
                              disabled={synonymLoadingTitle === path.targetRole}
                            >
                              {synonymLoadingTitle === path.targetRole ? (
                                <><Lightbulb className="mr-2 h-3 w-3 animate-pulse" /> Finding synonyms...</>
                              ) : (
                                <><Lightbulb className="mr-2 h-3 w-3" /> Find Title Synonyms</>
                              )}
                            </Button>
                          );
                        }
                        return null;
                      })()}

                      {/* CDM: Skill Decomposition Tree */}
                      {(() => {
                        const tree = cdmTrees.find((t) => t.pathId === path.id);
                        if (tree) {
                          // Group combinations by number of domains for a tiered view
                          const byTier = new Map<number, CDMCombination[]>();
                          for (const combo of tree.combinations) {
                            const tier = combo.domains.length;
                            if (!byTier.has(tier)) byTier.set(tier, []);
                            byTier.get(tier)!.push(combo);
                          }
                          const tiers = [...byTier.entries()].sort((a, b) => a[0] - b[0]);
                          // Collect all unique domain names
                          const allDomains = [...new Set(tree.combinations.flatMap((c) => c.domains.map((d) => d.name)))];

                          return (
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                                <Target className="h-3 w-3" /> Skill Decomposition Tree
                              </h4>
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {allDomains.map((d) => (
                                  <Badge key={d} className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 text-xs">
                                    {d}
                                  </Badge>
                                ))}
                              </div>
                              <div className="space-y-3">
                                {tiers.map(([tier, combos]) => (
                                  <div key={tier}>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                                      {tier === 1 ? "Single Domain" : tier === allDomains.length ? "Full Convergence" : `${tier}-Domain Combination`}
                                    </p>
                                    <div className="space-y-1.5">
                                      {combos.map((combo) => (
                                        <div
                                          key={combo.id}
                                          className="rounded-lg border p-2 text-sm"
                                        >
                                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                            {combo.domains.map((d) => (
                                              <Badge key={d.id} variant="outline" className="text-[10px]">
                                                {d.name}
                                              </Badge>
                                            ))}
                                            <Badge variant="outline" className="text-[10px] capitalize ml-auto">
                                              {combo.level}
                                            </Badge>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            {combo.roles.map((r) => (
                                              <span key={r} className="text-xs font-medium">
                                                {r}
                                              </span>
                                            ))}
                                          </div>
                                          {(combo.salaryMin || combo.salaryMax) && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                              ${(combo.salaryMin ?? 0).toLocaleString()}
                                              {combo.salaryMax ? ` – $${combo.salaryMax.toLocaleString()}` : "+"}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        if (path.targetRole) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDecompose(path)}
                              disabled={decomposingPathId === path.id}
                            >
                              {decomposingPathId === path.id ? (
                                <><Target className="mr-2 h-3 w-3 animate-spin" /> Decomposing...</>
                              ) : (
                                <><Target className="mr-2 h-3 w-3" /> Decompose Role</>
                              )}
                            </Button>
                          );
                        }
                        return null;
                      })()}

                      {/* BLS Wage Comparison */}
                      {path.targetRole && (
                        <BLSWageComparison
                          targetRole={path.targetRole}
                          targetSalaryMin={path.targetSalaryMin}
                          targetSalaryMax={path.targetSalaryMax}
                        />
                      )}

                      {/* Gaps */}
                      {gaps.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Gaps to Close
                          </h4>
                          <div className="space-y-1">
                            {gaps.map((g, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] shrink-0 capitalize mt-0.5"
                                >
                                  {g.type}
                                </Badge>
                                <span>
                                  <strong>{g.name}</strong>{" "}
                                  <span className="text-muted-foreground">— {g.detail}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Learning Suggestions for Skill Gaps */}
                      {(() => {
                        const pathSugg = suggestions.find((s) => s.pathId === path.id);
                        if (!pathSugg || pathSugg.items.length === 0) return null;
                        return (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" /> Suggested Learning
                            </h4>
                            <div className="space-y-2">
                              {pathSugg.items.map((item) => (
                                <div
                                  key={item.skill}
                                  className="rounded-lg border p-2.5 space-y-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">{item.skill}</span>
                                    {item.completedCount > 0 ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-[10px]">
                                        {item.completedCount} completed
                                      </Badge>
                                    ) : item.inProgressCount > 0 ? (
                                      <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-[10px]">
                                        {item.inProgressCount} in progress
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                                        No learning yet
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                                  {item.existingItems.length > 0 && (
                                    <div className="space-y-1">
                                      {item.existingItems.map((li) => (
                                        <div
                                          key={li.id}
                                          className="flex items-center gap-2 text-xs"
                                        >
                                          <BookOpen className="h-3 w-3 text-orange-500 shrink-0" />
                                          <span className="truncate">{li.title}</span>
                                          {li.provider && (
                                            <span className="text-muted-foreground shrink-0">
                                              ({li.provider})
                                            </span>
                                          )}
                                          <span className="ml-auto shrink-0 text-muted-foreground">
                                            {li.progress}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {!item.hasLearning && (
                                    <a
                                      href="/research"
                                      className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline mt-1"
                                    >
                                      <Plus className="h-3 w-3" /> Add learning item
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {!score && (
                        <p className="text-sm text-muted-foreground italic">
                          Capture a snapshot to see your alignment score for this path.
                        </p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
        </>
      )}

      {/* Snapshot History */}
      {snapshots.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              Score History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-20">
              {snapshots
                .slice(0, 20)
                .reverse()
                .map((snap) => {
                  const s = snap.overallScore ?? 0;
                  return (
                    <div
                      key={snap.id}
                      className={`flex-1 rounded-t min-h-[2px] ${scoreBg(s)}`}
                      style={{ height: `${s}%` }}
                      title={`${format(new Date(snap.capturedAt), "MMM d")} — Score: ${Math.round(s)}`}
                    />
                  );
                })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>
                {snapshots.length > 1
                  ? format(new Date(snapshots[snapshots.length - 1].capturedAt), "MMM d")
                  : ""}
              </span>
              <span>{format(new Date(snapshots[0].capturedAt), "MMM d")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Path Dialog */}
      <Dialog open={pathDialogOpen} onOpenChange={(open) => !open && closePathDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPathId ? "Edit Career Path" : "New Career Path"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePathSubmit} className="space-y-4">
            <div>
              <Label>Path Title *</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Staff Engineer, Engineering Manager"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this career direction means to you..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Role</Label>
                <Input
                  value={form.targetRole}
                  onChange={(e) => setForm({ ...form, targetRole: e.target.value })}
                  placeholder="e.g. Staff Software Engineer"
                />
              </div>
              <div>
                <Label>Level</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => setForm({ ...form, level: v ?? "mid" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Target Salary Min</Label>
                <Input
                  type="number"
                  value={form.targetSalaryMin}
                  onChange={(e) => setForm({ ...form, targetSalaryMin: e.target.value })}
                  placeholder="120000"
                />
              </div>
              <div>
                <Label>Target Salary Max</Label>
                <Input
                  type="number"
                  value={form.targetSalaryMax}
                  onChange={(e) => setForm({ ...form, targetSalaryMax: e.target.value })}
                  placeholder="180000"
                />
              </div>
              <div>
                <Label>Timeline (years)</Label>
                <Input
                  type="number"
                  value={form.timelineYears}
                  onChange={(e) => setForm({ ...form, timelineYears: e.target.value })}
                  placeholder="3"
                />
              </div>
            </div>
            <div>
              <Label>Industry</Label>
              <Input
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="e.g. Tech, Finance, Healthcare"
              />
            </div>

            {/* Required Skills */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Required Skills</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addSkillReq}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.requiredSkills.map((skill, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <Input
                    className="flex-1"
                    value={skill.name}
                    onChange={(e) => updateSkillReq(idx, "name", e.target.value)}
                    placeholder="Skill name"
                  />
                  <Select
                    value={skill.proficiency}
                    onValueChange={(v) => updateSkillReq(idx, "proficiency", v ?? "intermediate")}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROFICIENCY_OPTIONS.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSkillReq(idx)}
                    className="text-red-500 px-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Milestones */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Milestones</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addMilestone}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              {form.milestones.map((m, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      value={m.title}
                      onChange={(e) => {
                        const next = [...form.milestones];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setForm({ ...form, milestones: next });
                      }}
                      placeholder="Milestone title"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap mt-2">
                    <input
                      type="checkbox"
                      checked={m.isRequired}
                      onChange={(e) => {
                        const next = [...form.milestones];
                        next[idx] = { ...next[idx], isRequired: e.target.checked };
                        setForm({ ...form, milestones: next });
                      }}
                      className="rounded border-gray-300"
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMilestone(idx)}
                    className="text-red-500 px-2 mt-0.5"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closePathDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={savePathMutation.isPending}>
                {savePathMutation.isPending
                  ? "Saving..."
                  : editingPathId
                    ? "Update"
                    : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Bookmark,
  BookmarkCheck,
  DollarSign,
  ExternalLink,
  BarChart3,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* ── Types ── */

interface Occupation {
  code: string;
  title: string;
  group: string;
}

interface SalaryData {
  median: number | null;
  mean: number | null;
  low: number | null;
  high: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

interface Source {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

interface WageResponse {
  answer: string | null;
  salaryData: SalaryData;
  sources: Source[];
  cached?: boolean;
  fetchedAt?: string;
}

interface MarketSearch {
  id: string;
  seriesId: string;
  title: string;
  occupation: string | null;
  area: string | null;
  dataType: string;
  lastData: string | null;
  lastFetchedAt: string | null;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function fmt(v: number | null): string {
  if (v == null) return "—";
  return `$${Math.round(v).toLocaleString()}`;
}

/* ── Component ── */

export default function JobMarketResearch() {
  const qc = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedOcc, setSelectedOcc] = useState<Occupation | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSet = useCallback(
    debounce((v: string) => setDebouncedSearch(v), 300),
    []
  );

  function onSearchChange(v: string) {
    setSearchText(v);
    debouncedSet(v);
  }

  // ── Occupation search ──
  const { data: occupations = [] } = useQuery<Occupation[]>({
    queryKey: ["occupations", debouncedSearch],
    queryFn: () =>
      fetch(`/api/market-research/occupations?q=${encodeURIComponent(debouncedSearch)}`).then(
        (r) => r.json()
      ),
    enabled: debouncedSearch.length >= 2,
  });

  // ── Wage data via Tavily ──
  const { data: wageData, isLoading: wageLoading } = useQuery<WageResponse>({
    queryKey: ["tavily-wages", selectedOcc?.code],
    queryFn: () =>
      fetch(
        `/api/market-research/bls?occupation=${encodeURIComponent(selectedOcc!.title)}&code=${encodeURIComponent(selectedOcc!.code)}`
      ).then((r) => r.json()),
    enabled: !!selectedOcc,
    staleTime: 1000 * 60 * 10, // cache 10 min
  });

  // ── Saved searches ──
  const { data: savedSearches = [] } = useQuery<MarketSearch[]>({
    queryKey: ["market-searches"],
    queryFn: () => fetch("/api/market-research").then((r) => r.json()),
  });

  const saveSearch = useMutation({
    mutationFn: () => {
      if (!selectedOcc) throw new Error("No occupation selected");
      return fetch("/api/market-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: selectedOcc.code,
          title: selectedOcc.title,
          occupation: selectedOcc.code,
          dataType: "wages",
          lastData: wageData ?? null,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-searches"] });
      toast.success("Saved to bookmarks");
    },
    onError: () => toast.error("Failed to save"),
  });

  const removeSearch = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/market-research/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-searches"] });
      toast.success("Removed");
    },
  });

  // ── Build chart data from salary extraction ──
  const chartData = wageData?.salaryData
    ? [
        { label: "10th Pct", value: wageData.salaryData.p10, color: "#94a3b8" },
        { label: "25th Pct", value: wageData.salaryData.p25, color: "#64748b" },
        { label: "Median", value: wageData.salaryData.median, color: "#3b82f6" },
        { label: "Mean", value: wageData.salaryData.mean, color: "#10b981" },
        { label: "75th Pct", value: wageData.salaryData.p75, color: "#8b5cf6" },
        { label: "90th Pct", value: wageData.salaryData.p90, color: "#f59e0b" },
      ].filter((d) => d.value != null)
    : [];

  // Also build a low-median-high summary if available
  const rangeData = wageData?.salaryData
    ? [
        { label: "Low", value: wageData.salaryData.low, color: "#94a3b8" },
        { label: "Median", value: wageData.salaryData.median, color: "#3b82f6" },
        { label: "High", value: wageData.salaryData.high, color: "#f59e0b" },
      ].filter((d) => d.value != null)
    : [];

  const displayChart = chartData.length >= 2 ? chartData : rangeData.length >= 2 ? rangeData : [];

  const isSaved = savedSearches.some((s) => s.occupation === selectedOcc?.code);

  return (
    <div className="space-y-6">
      {/* ── Saved Searches ── */}
      {savedSearches.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">Saved Occupations</p>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((s) => (
              <Badge
                key={s.id}
                variant="secondary"
                className="cursor-pointer gap-1 py-1"
              >
                <span
                  onClick={() => {
                    const occ: Occupation = {
                      code: s.occupation || "",
                      title: s.title,
                      group: "",
                    };
                    setSelectedOcc(occ);
                    setSearchText(s.title);
                  }}
                >
                  {s.title}
                </span>
                <button
                  className="ml-1 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSearch.mutate(s.id);
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search occupations (e.g. software, nurse, engineer)..."
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />

        {/* Dropdown results */}
        {debouncedSearch.length >= 2 && !selectedOcc && occupations.length > 0 && (
          <Card className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto">
            <CardContent className="p-2">
              {occupations.map((occ) => (
                <button
                  key={occ.code}
                  className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setSelectedOcc(occ);
                    setSearchText(occ.title);
                    setDebouncedSearch("");
                  }}
                >
                  <div>
                    <span className="font-medium">{occ.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{occ.code}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {occ.group}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Selected Occupation ── */}
      {selectedOcc && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{selectedOcc.title}</h3>
              <p className="text-sm text-muted-foreground">
                SOC {selectedOcc.code} &middot; {selectedOcc.group}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveSearch.mutate()}
                disabled={isSaved || saveSearch.isPending}
              >
                {isSaved ? (
                  <BookmarkCheck className="mr-1 h-4 w-4" />
                ) : (
                  <Bookmark className="mr-1 h-4 w-4" />
                )}
                {isSaved ? "Saved" : "Save"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedOcc(null);
                  setSearchText("");
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          {wageLoading ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Searching salary data...</span>
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
          ) : wageData ? (
            <div className="space-y-4">
              {/* ── AI Summary ── */}
              {wageData.answer && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="h-4 w-4" /> Salary Overview
                      {wageData.cached && (
                        <Badge variant="outline" className="ml-auto text-[10px] font-normal text-muted-foreground">
                          Cached{wageData.fetchedAt ? ` · ${new Date(wageData.fetchedAt).toLocaleDateString()}` : ""}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                      {wageData.answer}
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* ── Wage Chart ── */}
                {displayChart.length >= 2 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart3 className="h-4 w-4" /> Annual Wage Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={displayChart}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                          />
                          <Tooltip
                            formatter={(value) =>
                              `$${Number(value).toLocaleString()}`
                            }
                          />
                          <Bar
                            dataKey="value"
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* ── Wage Stats ── */}
                {wageData.salaryData && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="h-4 w-4" /> Key Figures
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {wageData.salaryData.median != null && (
                          <div>
                            <p className="text-2xl font-bold text-blue-500">
                              {fmt(wageData.salaryData.median)}
                            </p>
                            <p className="text-xs text-muted-foreground">Median Annual</p>
                          </div>
                        )}
                        {wageData.salaryData.mean != null && (
                          <div>
                            <p className="text-2xl font-bold text-emerald-500">
                              {fmt(wageData.salaryData.mean)}
                            </p>
                            <p className="text-xs text-muted-foreground">Mean Annual</p>
                          </div>
                        )}
                        {wageData.salaryData.low != null && (
                          <div>
                            <p className="text-2xl font-bold text-slate-400">
                              {fmt(wageData.salaryData.low)}
                            </p>
                            <p className="text-xs text-muted-foreground">Low End</p>
                          </div>
                        )}
                        {wageData.salaryData.high != null && (
                          <div>
                            <p className="text-2xl font-bold text-amber-500">
                              {fmt(wageData.salaryData.high)}
                            </p>
                            <p className="text-xs text-muted-foreground">High End</p>
                          </div>
                        )}
                        {wageData.salaryData.p10 != null && (
                          <div>
                            <p className="text-lg font-semibold text-slate-400">
                              {fmt(wageData.salaryData.p10)}
                            </p>
                            <p className="text-xs text-muted-foreground">10th Percentile</p>
                          </div>
                        )}
                        {wageData.salaryData.p25 != null && (
                          <div>
                            <p className="text-lg font-semibold text-slate-500">
                              {fmt(wageData.salaryData.p25)}
                            </p>
                            <p className="text-xs text-muted-foreground">25th Percentile</p>
                          </div>
                        )}
                        {wageData.salaryData.p75 != null && (
                          <div>
                            <p className="text-lg font-semibold text-violet-500">
                              {fmt(wageData.salaryData.p75)}
                            </p>
                            <p className="text-xs text-muted-foreground">75th Percentile</p>
                          </div>
                        )}
                        {wageData.salaryData.p90 != null && (
                          <div>
                            <p className="text-lg font-semibold text-amber-500">
                              {fmt(wageData.salaryData.p90)}
                            </p>
                            <p className="text-xs text-muted-foreground">90th Percentile</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* ── Sources ── */}
              {wageData.sources && wageData.sources.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ExternalLink className="h-4 w-4" /> Sources
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {wageData.sources.slice(0, 5).map((src, i) => (
                        <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {src.title}
                          </a>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {src.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Empty state ── */}
      {!selectedOcc && savedSearches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Search for an occupation above to see salary data from across the web.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Covers 800+ occupations with median, mean, and percentile wages.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Bookmark,
  BookmarkCheck,
  Trash2,
  TrendingUp,
  DollarSign,
  RefreshCw,
  BarChart3,
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
  LineChart,
  Line,
} from "recharts";

/* ── Types ── */

interface Occupation {
  code: string;
  title: string;
  group: string;
}

interface BLSDataPoint {
  year: string;
  period: string;
  periodName: string;
  value: number | null;
}

interface BLSSeries {
  seriesId: string;
  data: BLSDataPoint[];
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

// BLS OEWS data types  
const WAGE_TYPES = [
  { code: "13", label: "Median", color: "#3b82f6" },
  { code: "04", label: "Mean", color: "#10b981" },
  { code: "07", label: "10th Pct", color: "#94a3b8" },
  { code: "08", label: "25th Pct", color: "#64748b" },
  { code: "11", label: "75th Pct", color: "#8b5cf6" },
  { code: "12", label: "90th Pct", color: "#f59e0b" },
];

function buildSeriesId(occCode: string, dataTypeCode: string, area = "0000000"): string {
  // OEWS series: OEUM{area7}{occCode6}{dataType2}
  const occ = occCode.replace("-", "");
  return `OEUM${area}${occ}${dataTypeCode}`;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
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

  // ── Wage data for selected occupation ──
  const medianSeriesId = selectedOcc
    ? buildSeriesId(selectedOcc.code, "13")
    : null;

  const allSeriesIds = selectedOcc
    ? WAGE_TYPES.map((w) => buildSeriesId(selectedOcc.code, w.code)).join(",")
    : null;

  const { data: wageData, isLoading: wageLoading } = useQuery<{
    series: BLSSeries[];
  }>({
    queryKey: ["bls-wages", selectedOcc?.code],
    queryFn: () =>
      fetch(
        `/api/market-research/bls?series=${allSeriesIds}&startyear=2020&endyear=2025`
      ).then((r) => r.json()),
    enabled: !!allSeriesIds,
  });

  // ── Saved searches ──
  const { data: savedSearches = [] } = useQuery<MarketSearch[]>({
    queryKey: ["market-searches"],
    queryFn: () => fetch("/api/market-research").then((r) => r.json()),
  });

  const saveSearch = useMutation({
    mutationFn: () => {
      if (!selectedOcc || !medianSeriesId) throw new Error("No occupation selected");
      return fetch("/api/market-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: medianSeriesId,
          title: selectedOcc.title,
          occupation: selectedOcc.code,
          dataType: "wages",
          lastData: wageData?.series || null,
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

  // ── Parse wage data into chart-friendly format ──
  const latestWages = wageData?.series
    ? WAGE_TYPES.map((wt, i) => {
        const series = wageData.series[i];
        const annual = series?.data.find((d) => d.period === "M13");
        return {
          label: wt.label,
          value: annual?.value ?? null,
          color: wt.color,
        };
      }).filter((w) => w.value !== null)
    : [];

  const trendData = wageData?.series
    ? (() => {
        // Use median series (index 0) for trend
        const medianSeries = wageData.series[0];
        if (!medianSeries) return [];
        return medianSeries.data
          .filter((d) => d.period === "M13")
          .map((d) => ({
            year: d.year,
            median: d.value,
          }))
          .sort((a, b) => a.year.localeCompare(b.year));
      })()
    : [];

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
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* ── Wage Distribution ── */}
              {latestWages.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <DollarSign className="h-4 w-4" /> Annual Wage Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={latestWages}>
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

              {/* ── Trend Chart ── */}
              {trendData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4" /> Median Wage Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          formatter={(value) =>
                            `$${Number(value).toLocaleString()}`
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="median"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* ── Stats Summary ── */}
              {latestWages.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4" /> Wage Summary (Latest Year)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {latestWages.map((w) => (
                        <div key={w.label} className="text-center">
                          <p className="text-lg font-bold" style={{ color: w.color }}>
                            ${((w.value || 0) / 1000).toFixed(0)}k
                          </p>
                          <p className="text-xs text-muted-foreground">{w.label}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── No data state ── */}
              {latestWages.length === 0 && !wageLoading && (
                <Card className="md:col-span-2">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <RefreshCw className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="text-muted-foreground">
                      No BLS wage data available for this occupation.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The BLS free API has a 25 request/day limit. Try again later if needed.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {!selectedOcc && savedSearches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Search for an occupation above to see wage data from the Bureau of Labor Statistics.
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

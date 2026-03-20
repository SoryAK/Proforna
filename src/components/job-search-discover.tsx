"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, MapPin, Briefcase, ExternalLink, Plus, Loader2, Building2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface ApplyLink {
  title: string;
  link: string;
}

interface DetectedExtensions {
  posted_at?: string;
  schedule_type?: string;
  salary?: string;
  work_from_home?: boolean;
}

interface JobResult {
  title: string;
  company: string;
  location: string;
  description: string;
  thumbnail: string | null;
  via: string;
  extensions: string[];
  jobId: string;
  applyLinks: ApplyLink[];
  detectedExtensions: DetectedExtensions;
}

interface SearchResponse {
  jobs: JobResult[];
  searchInfo: Record<string, unknown>;
  hasMore: boolean;
  nextPageToken: string | null;
}

export function JobSearchDiscover() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<JobResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const trackMutation = useMutation({
    mutationFn: async (job: JobResult) => {
      const body: Record<string, unknown> = {
        company: job.company,
        role: job.title,
        location: job.location,
        url: job.applyLinks[0]?.link || null,
        type: job.detectedExtensions.work_from_home
          ? "remote"
          : job.location?.toLowerCase().includes("remote")
            ? "remote"
            : "onsite",
        status: "wishlist",
        notes: `Found via ${job.via}\n\n${job.description.slice(0, 500)}...`,
      };

      if (job.detectedExtensions.salary) {
        const salaryStr = job.detectedExtensions.salary;
        const numbers = salaryStr.match(/[\d,]+/g)?.map((n) => parseInt(n.replace(/,/g, ""), 10)) ?? [];
        if (numbers.length >= 2) {
          body.salaryMin = numbers[0];
          body.salaryMax = numbers[1];
        } else if (numbers.length === 1) {
          body.salaryMin = numbers[0];
        }
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to track application");
      return res.json();
    },
    onSuccess: (_data, job) => {
      setTrackedIds((prev) => new Set(prev).add(job.jobId));
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success(`Tracking ${job.title} at ${job.company}`);
    },
    onError: () => {
      toast.error("Failed to save application");
    },
  });

  async function doSearch(pageToken?: string) {
    if (!query.trim()) return;
    const isNewSearch = !pageToken;
    if (isNewSearch) {
      setSearching(true);
      setResults([]);
      setNextToken(null);
      setTrackedIds(new Set());
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (location.trim()) params.set("location", location.trim());
      if (pageToken) params.set("next_page_token", pageToken);

      const res = await fetch(`/api/job-search?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Search failed");
      }

      const data: SearchResponse = await res.json();
      if (isNewSearch) {
        setResults(data.jobs);
      } else {
        setResults((prev) => [...prev, ...data.jobs]);
      }
      setHasMore(data.hasMore);
      setNextToken(data.nextPageToken);
      setSearched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <Card>
        <CardContent className="pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Job title, keywords, or company..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="relative sm:w-52">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={searching || !query.trim()}>
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {searching && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Searching Google Jobs...
        </div>
      )}

      {!searching && searched && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No jobs found. Try different keywords or location.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground px-1">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>

          {results.map((job) => {
            const isExpanded = expandedJob === job.jobId;
            const isTracked = trackedIds.has(job.jobId);
            const ext = job.detectedExtensions;

            return (
              <Card
                key={job.jobId}
                className="hover:shadow-md transition-shadow"
              >
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    {/* Company thumbnail */}
                    {job.thumbnail ? (
                      <img
                        src={job.thumbnail}
                        alt=""
                        className="h-10 w-10 rounded-md object-contain shrink-0 bg-muted p-1"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Title + track button */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold leading-tight">
                            {job.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {job.company}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={isTracked ? "outline" : "default"}
                          disabled={isTracked || trackMutation.isPending}
                          onClick={() => trackMutation.mutate(job)}
                          className="shrink-0"
                        >
                          {isTracked ? (
                            "Tracked"
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Track
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Meta badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.location && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            <MapPin className="h-3 w-3 mr-1" />
                            {job.location}
                          </Badge>
                        )}
                        {ext.salary && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {ext.salary}
                          </Badge>
                        )}
                        {ext.schedule_type && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            <Clock className="h-3 w-3 mr-1" />
                            {ext.schedule_type}
                          </Badge>
                        )}
                        {ext.posted_at && (
                          <Badge variant="outline" className="text-xs font-normal">
                            {ext.posted_at}
                          </Badge>
                        )}
                      </div>

                      {/* Source */}
                      {job.via && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {job.via}
                        </p>
                      )}

                      {/* Description (expandable) */}
                      <div className="mt-2">
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {isExpanded
                            ? job.description
                            : job.description.slice(0, 200) +
                              (job.description.length > 200 ? "..." : "")}
                        </p>
                        {job.description.length > 200 && (
                          <button
                            onClick={() =>
                              setExpandedJob(isExpanded ? null : job.jobId)
                            }
                            className="text-xs text-orange-600 hover:underline mt-1"
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>

                      {/* Apply links */}
                      {job.applyLinks.length > 0 && (
                        <>
                          <Separator className="my-2" />
                          <div className="flex flex-wrap gap-2">
                            {job.applyLinks.slice(0, 3).map((link, i) => (
                              <a
                                key={i}
                                href={link.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Apply on {link.title}
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => doSearch(nextToken ?? undefined)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Load more results
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state before first search */}
      {!searched && !searching && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <h3 className="font-medium text-foreground mb-1">
            Discover job opportunities
          </h3>
          <p className="text-sm max-w-md mx-auto">
            Search across Google Jobs to find openings, then track them directly
            in your application pipeline.
          </p>
        </div>
      )}
    </div>
  );
}

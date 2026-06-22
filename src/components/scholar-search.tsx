"use client";

import { useState } from "react";
import {
  Search,
  Loader2,
  GraduationCap,
  ExternalLink,
  FileText,
  Quote,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { unwrapAIEnvelope, type AIMeta } from "@/lib/ai/envelope";
import { AIProvenanceChip } from "@/components/ai-provenance-chip";

interface Resource {
  title: string;
  fileFormat: string;
  link: string;
}

interface ScholarResult {
  title: string;
  link: string;
  snippet: string;
  publicationInfo: string;
  citedBy: number | null;
  citedByLink: string | null;
  relatedLink: string | null;
  resources: Resource[];
  position: number;
}

interface ScholarResponse {
  results: ScholarResult[];
  searchInfo: Record<string, unknown>;
  hasMore: boolean;
}

const QUICK_SEARCHES = [
  "career development strategies",
  "remote work productivity",
  "AI impact on employment",
  "salary negotiation research",
  "tech industry workforce trends",
];

export default function ScholarSearch() {
  const [query, setQuery] = useState("");
  const [yearLow, setYearLow] = useState("");
  const [results, setResults] = useState<ScholarResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastAi, setLastAi] = useState<AIMeta | null>(null);

  async function doSearch(startOffset = 0, q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    if (q) setQuery(q);

    const isNewSearch = startOffset === 0;
    if (isNewSearch) {
      setSearching(true);
      setResults([]);
      setPage(0);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      if (startOffset > 0) params.set("start", String(startOffset));
      if (yearLow) params.set("year_low", yearLow);

      const res = await fetch(`/api/google-scholar?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Search failed");
      }

      const envelope = await res.json();
      const { data: payload, ai } = unwrapAIEnvelope<ScholarResponse>(envelope);
      if (ai) setLastAi(ai);
      const data: ScholarResponse = payload ?? {
        results: [],
        searchInfo: {},
        hasMore: false,
      };
      if (isNewSearch) {
        setResults(data.results);
      } else {
        setResults((prev) => [...prev, ...data.results]);
      }
      setHasMore(data.hasMore);
      setPage(startOffset);
      setSearched(true);
    } catch {
      // toast would be ideal but keeping deps minimal
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch(0);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search academic papers, research..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="sm:w-28">
              <Input
                placeholder="From year"
                value={yearLow}
                onChange={(e) => setYearLow(e.target.value)}
                type="number"
                min="1900"
                max="2026"
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

          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted-foreground py-1">Quick:</span>
            {QUICK_SEARCHES.map((q) => (
              <button
                key={q}
                onClick={() => doSearch(0, q)}
                className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {searching && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Searching Google Scholar...
        </div>
      )}

      {/* No results */}
      {!searching && searched && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No papers found. Try different keywords.</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            <AIProvenanceChip ai={lastAi} />
          </div>

          {results.map((paper, idx) => (
            <Card key={idx} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  {/* Title */}
                  <a
                    href={paper.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold leading-tight hover:text-orange-600 transition-colors block"
                  >
                    {paper.title}
                  </a>

                  {/* Publication info */}
                  {paper.publicationInfo && (
                    <p className="text-xs text-muted-foreground">
                      {paper.publicationInfo}
                    </p>
                  )}

                  {/* Snippet */}
                  {paper.snippet && (
                    <p className="text-sm text-muted-foreground">
                      {paper.snippet}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {paper.citedBy !== null && (
                      <a
                        href={paper.citedByLink ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1"
                      >
                        <Badge variant="secondary" className="text-xs font-normal">
                          <Quote className="h-3 w-3 mr-1" />
                          Cited by {paper.citedBy}
                        </Badge>
                      </a>
                    )}

                    {paper.resources.map((r, ri) => (
                      <a
                        key={ri}
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1"
                      >
                        <Badge variant="outline" className="text-xs font-normal">
                          <FileText className="h-3 w-3 mr-1" />
                          {r.fileFormat || r.title}
                        </Badge>
                      </a>
                    ))}

                    <a
                      href={paper.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>

                    {paper.relatedLink && (
                      <a
                        href={paper.relatedLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="h-3 w-3" />
                        Related
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => doSearch(page + 10)}
                disabled={loadingMore}
              >
                {loadingMore && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Load more results
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!searched && !searching && (
        <div className="text-center py-16 text-muted-foreground">
          <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <h3 className="font-medium text-foreground mb-1">
            Academic &amp; Industry Research
          </h3>
          <p className="text-sm max-w-md mx-auto">
            Search Google Scholar for academic papers, industry whitepapers, and
            research studies on career development, technology trends, and more.
          </p>
        </div>
      )}
    </div>
  );
}

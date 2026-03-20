"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  Newspaper,
  ExternalLink,
  Building2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface SubStory {
  title: string;
  link: string;
  source: string;
  date: string;
}

interface NewsArticle {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet: string;
  thumbnail: string | null;
  stories: SubStory[];
}

const QUICK_SEARCHES = [
  "tech industry layoffs",
  "AI hiring trends",
  "remote work policy",
  "software engineer salary",
  "startup funding",
];

export default function CompanyNews() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["google-news", activeQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ q: activeQuery });
      const res = await fetch(`/api/google-news?${params}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Search failed");
      }
      return res.json() as Promise<{ articles: NewsArticle[] }>;
    },
    enabled: activeQuery.length > 0,
  });

  function doSearch(q?: string) {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setActiveQuery(searchQuery.trim());
    if (q) setQuery(q);
  }

  const articles = data?.articles ?? [];

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search company or topic news..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={isLoading || !query.trim()}>
              {isLoading ? (
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
                onClick={() => doSearch(q)}
                className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {(isLoading || isFetching) && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Searching Google News...
        </div>
      )}

      {/* No results */}
      {!isLoading && !isFetching && activeQuery && articles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Newspaper className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No news found for &quot;{activeQuery}&quot;</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && !isFetching && articles.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground px-1">
            {articles.length} result{articles.length !== 1 ? "s" : ""} for &quot;{activeQuery}&quot;
          </p>

          {articles.map((article, idx) => {
            const isExpanded = expandedId === idx;
            const hasStories = article.stories.length > 0;

            return (
              <Card key={idx} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    {article.thumbnail ? (
                      <img
                        src={article.thumbnail}
                        alt=""
                        className="h-16 w-24 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-24 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <Newspaper className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold leading-tight hover:text-orange-600 transition-colors"
                      >
                        {article.title}
                      </a>

                      <div className="flex items-center gap-2 mt-1">
                        {article.source && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            {article.source}
                          </Badge>
                        )}
                        {article.date && (
                          <span className="text-xs text-muted-foreground">
                            {article.date}
                          </span>
                        )}
                      </div>

                      {article.snippet && (
                        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                          {article.snippet}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Read full article
                        </a>

                        {hasStories && (
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : idx)
                            }
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            {article.stories.length} related{" "}
                            {article.stories.length === 1
                              ? "story"
                              : "stories"}
                          </button>
                        )}
                      </div>

                      {/* Related stories */}
                      {isExpanded && hasStories && (
                        <>
                          <Separator className="my-2" />
                          <div className="space-y-2">
                            {article.stories.map((story, si) => (
                              <div key={si} className="flex items-start gap-2">
                                <Building2 className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                                <div>
                                  <a
                                    href={story.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm hover:text-orange-600 transition-colors"
                                  >
                                    {story.title}
                                  </a>
                                  <p className="text-xs text-muted-foreground">
                                    {story.source}
                                    {story.date ? ` · ${story.date}` : ""}
                                  </p>
                                </div>
                              </div>
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
        </div>
      )}

      {/* Empty state */}
      {!activeQuery && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <h3 className="font-medium text-foreground mb-1">Company &amp; Industry News</h3>
          <p className="text-sm max-w-md mx-auto">
            Search Google News for the latest updates on companies you&apos;re
            applying to, industry trends, or career topics.
          </p>
        </div>
      )}
    </div>
  );
}

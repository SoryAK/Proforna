"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Rss,
  Search,
  Filter,
  ChevronDown,
  FileText,
  Loader2,
  CheckCheck,
  Clock,
  Eye,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import DOMPurify from "isomorphic-dompurify";
import { stripHtml } from "@/lib/rss";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Types ── */

interface ResearchFeed {
  id: string;
  title: string;
  url: string;
  category: string;
  isActive: boolean;
  lastFetchedAt: string | null;
  _count: { articles: number };
}

interface ResearchArticle {
  id: string;
  feedId: string;
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
  content: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
  isBookmarked: boolean;
  isRead: boolean;
  feed: { title: string; category: string };
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "industry", label: "Industry" },
  { value: "tech", label: "Technology" },
  { value: "finance", label: "Finance" },
  { value: "career", label: "Career" },
];

const PRESET_FEEDS = [
  { url: "https://hnrss.org/frontpage", title: "Hacker News", category: "tech" },
  { url: "https://feeds.feedburner.com/TechCrunch/", title: "TechCrunch", category: "tech" },
  { url: "https://www.theverge.com/rss/index.xml", title: "The Verge", category: "tech" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", title: "BBC Business", category: "finance" },
  { url: "https://www.bls.gov/feed/bls_latest.rss", title: "BLS News", category: "industry" },
  { url: "https://hbr.org/resources/xml/rss.xml", title: "Harvard Business Review", category: "career" },
];

const CAT_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  industry: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  tech: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  finance: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  career: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

const CAT_ICONS: Record<string, string> = {
  general: "📰",
  industry: "🏭",
  tech: "💻",
  finance: "📈",
  career: "🎯",
};

/** Estimate reading time from summary length */
function estimateReadTime(summary: string | null): string {
  if (!summary) return "1 min read";
  const words = stripHtml(summary).split(/\s+/).length;
  // Summary is truncated, so assume full article is ~5-8x longer
  const estimatedWords = Math.max(words * 6, 200);
  const mins = Math.max(1, Math.round(estimatedWords / 200));
  return `${mins} min read`;
}

/** Get domain from URL for display */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/* ── Component ── */

export default function IndustryResearch() {
  const qc = useQueryClient();
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedCategory, setFeedCategory] = useState("general");
  const [feedsExpanded, setFeedsExpanded] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterFeed, setFilterFeed] = useState("all");
  const [filterType, setFilterType] = useState<"all" | "bookmarked" | "unread">("all");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  // ── Queries ──
  const { data: feeds = [], isLoading: feedsLoading } = useQuery<ResearchFeed[]>({
    queryKey: ["research-feeds"],
    queryFn: () => fetch("/api/research-feeds").then((r) => r.json()),
  });

  const articleParams = new URLSearchParams();
  if (filterFeed !== "all") articleParams.set("feedId", filterFeed);
  if (filterType === "bookmarked") articleParams.set("bookmarked", "true");
  if (filterType === "unread") articleParams.set("unread", "true");
  if (searchQ.trim()) articleParams.set("q", searchQ.trim());

  interface ArticlePage {
    articles: ResearchArticle[];
    nextCursor: string | null;
  }

  const {
    data: articlePages,
    isLoading: articlesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["research-articles", filterFeed, filterType, searchQ] as const,
    queryFn: async ({ pageParam }): Promise<ArticlePage> => {
      const p = new URLSearchParams(articleParams);
      if (pageParam) p.set("cursor", pageParam);
      return fetch(`/api/research-articles?${p.toString()}`).then((r) => r.json());
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage: ArticlePage) => lastPage.nextCursor ?? undefined,
  });

  const articles: ResearchArticle[] = articlePages?.pages.flatMap((p) => p.articles ?? []) ?? [];

  // ── Mutations ──
  const addFeed = useMutation({
    mutationFn: (data: { url: string; category: string }) =>
      fetch("/api/research-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-feeds"] });
      toast.success("Feed added");
      setFeedUrl("");
      setAddFeedOpen(false);
    },
    onError: () => toast.error("Failed to add feed"),
  });

  const removeFeed = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/research-feeds/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-feeds"] });
      qc.invalidateQueries({ queryKey: ["research-articles"] });
      toast.success("Feed removed");
    },
  });

  const fetchArticles = useMutation({
    mutationFn: () =>
      fetch("/api/research-articles/fetch", { method: "POST" }).then((r) => r.json()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["research-articles"] });
      qc.invalidateQueries({ queryKey: ["research-feeds"] });
      toast.success(`Fetched ${data.fetched} new article${data.fetched !== 1 ? "s" : ""}`);
      if (data.errors?.length) {
        toast.error(`${data.errors.length} feed(s) had errors`);
      }
    },
    onError: () => toast.error("Fetch failed"),
  });

  const toggleBookmark = useMutation({
    mutationFn: (article: ResearchArticle) =>
      fetch(`/api/research-articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBookmarked: !article.isBookmarked }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research-articles"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/research-articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["research-articles"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unread = articles.filter((a) => !a.isRead);
      await Promise.all(
        unread.map((a) =>
          fetch(`/api/research-articles/${a.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isRead: true }),
          })
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["research-articles"] });
      toast.success("All articles marked as read");
    },
  });

  /** Sanitize HTML for safe rendering */
  const sanitize = useCallback(
    (html: string) =>
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'img', 'figure', 'figcaption'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
        ALLOW_DATA_ATTR: false,
      }),
    []
  );

  async function handleExtract(article: ResearchArticle) {
    if (expandedArticle === article.id) {
      setExpandedArticle(null);
      return;
    }
    if (article.content) {
      setExpandedArticle(article.id);
      if (!article.isRead) markRead.mutate(article.id);
      return;
    }
    setExtractingId(article.id);
    try {
      const res = await fetch(`/api/research-articles/${article.id}/extract`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Extraction failed");
      qc.invalidateQueries({ queryKey: ["research-articles"] });
      setExpandedArticle(article.id);
      if (!article.isRead) markRead.mutate(article.id);
    } catch {
      toast.error("Could not extract article content");
    } finally {
      setExtractingId(null);
    }
  }

  if (feedsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Feed Manager (collapsible) ── */}
      <Card>
        <CardHeader
          className="cursor-pointer pb-2"
          onClick={() => setFeedsExpanded(!feedsExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rss className="h-4 w-4" />
              RSS Feeds ({feeds.length})
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${feedsExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>

        {feedsExpanded && (
          <CardContent className="space-y-3 pt-0">
            {/* Feed list */}
            {feeds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No feeds yet. Add one or use a preset below.
              </p>
            ) : (
              <div className="space-y-2">
                {feeds.map((feed) => (
                  <div
                    key={feed.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{feed.title}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge className={`text-xs ${CAT_COLORS[feed.category] || CAT_COLORS.general}`}>
                          {feed.category}
                        </Badge>
                        <span>{feed._count.articles} articles</span>
                        {feed.lastFetchedAt && (
                          <span>
                            fetched{" "}
                            {formatDistanceToNow(new Date(feed.lastFetchedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFeed.mutate(feed.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick add presets */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Quick Add Presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_FEEDS.filter(
                  (p) => !feeds.some((f) => f.url === p.url)
                ).map((preset) => (
                  <Button
                    key={preset.url}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      addFeed.mutate({ url: preset.url, category: preset.category })
                    }
                    disabled={addFeed.isPending}
                  >
                    <Plus className="mr-1 h-3 w-3" /> {preset.title}
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom feed URL */}
            <Button variant="outline" size="sm" onClick={() => setAddFeedOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Custom Feed
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => fetchArticles.mutate()}
          disabled={fetchArticles.isPending || feeds.length === 0}
        >
          <RefreshCw
            className={`mr-1 h-4 w-4 ${fetchArticles.isPending ? "animate-spin" : ""}`}
          />
          {fetchArticles.isPending ? "Fetching..." : "Refresh All"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || articles.filter((a) => !a.isRead).length === 0}
        >
          <CheckCheck className="mr-1 h-4 w-4" />
          Mark All Read
        </Button>

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search articles..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterFeed} onValueChange={(v) => setFilterFeed(v ?? "all")}>
          <SelectTrigger className="w-[150px]">
            <Filter className="mr-1 h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Feeds</SelectItem>
            {feeds.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterType}
          onValueChange={(v) => setFilterType((v ?? "all") as "all" | "bookmarked" | "unread")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Articles</SelectItem>
            <SelectItem value="bookmarked">Bookmarked</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Articles ── */}
      {articlesLoading ? (
        <div className="space-y-4">
          {/* Hero skeleton */}
          <div className="relative overflow-hidden rounded-xl border">
            <Skeleton className="h-64 w-full" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="mb-2 h-7 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          {/* Grid skeletons */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="overflow-hidden rounded-xl border">
                <Skeleton className="h-40 w-full" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : articles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <Rss className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">
              {feeds.length === 0 ? "No feeds configured" : "No articles yet"}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {feeds.length === 0
                ? "Expand the RSS Feeds panel above and add some feeds to start reading industry news."
                : "Hit \"Refresh All\" to fetch the latest articles from your feeds."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider delay={300}>
          <div className="space-y-6">
            {/* ── Featured Hero Card (first unread article with image, or first article) ── */}
            {(() => {
              const hero = articles.find((a) => a.imageUrl && !a.isRead) || articles.find((a) => a.imageUrl) || articles[0];
              if (!hero) return null;
              return (
                <Card
                  className="group relative overflow-hidden border-0 shadow-lg transition-shadow hover:shadow-xl"
                >
                  {/* Background image */}
                  {hero.imageUrl ? (
                    <div className="relative h-64 sm:h-72 md:h-80">
                      <img
                        src={hero.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    </div>
                  ) : (
                    <div className="relative h-48 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
                  )}

                  {/* Content overlay */}
                  <div className={`${hero.imageUrl ? "absolute bottom-0 left-0 right-0" : ""} p-5 sm:p-6`}>
                    <div className="mb-2 flex items-center gap-2">
                      <Badge className={`text-xs ${CAT_COLORS[hero.feed.category] || CAT_COLORS.general}`}>
                        {CAT_ICONS[hero.feed.category] || "📰"} {hero.feed.title}
                      </Badge>
                      {!hero.isRead && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                          New
                        </span>
                      )}
                    </div>
                    <a
                      href={hero.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block text-xl font-bold leading-tight sm:text-2xl ${hero.imageUrl ? "text-white" : "text-foreground"} transition-colors hover:underline`}
                      onClick={() => { if (!hero.isRead) markRead.mutate(hero.id); }}
                    >
                      {hero.title}
                    </a>
                    {hero.summary && (
                      <p className={`mt-2 line-clamp-2 text-sm ${hero.imageUrl ? "text-gray-200" : "text-muted-foreground"}`}>
                        {stripHtml(hero.summary)}
                      </p>
                    )}
                    <div className={`mt-3 flex items-center gap-3 text-xs ${hero.imageUrl ? "text-gray-300" : "text-muted-foreground"}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {estimateReadTime(hero.summary)}
                      </span>
                      {hero.publishedAt && (
                        <span>
                          {formatDistanceToNow(new Date(hero.publishedAt), { addSuffix: true })}
                        </span>
                      )}
                      <span className="opacity-60">{getDomain(hero.url)}</span>
                      <div className="ml-auto flex gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                            onClick={() => toggleBookmark.mutate(hero)}
                          >
                            {hero.isBookmarked ? (
                              <BookmarkCheck className="h-4 w-4 text-yellow-400" />
                            ) : (
                              <Bookmark className={`h-4 w-4 ${hero.imageUrl ? "text-gray-300" : "text-muted-foreground"}`} />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>{hero.isBookmarked ? "Remove Bookmark" : "Bookmark"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            className="rounded-full p-1.5 transition-colors hover:bg-white/20"
                            onClick={() => handleExtract(hero)}
                            disabled={extractingId === hero.id}
                          >
                            {extractingId === hero.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className={`h-4 w-4 ${hero.imageUrl ? "text-gray-300" : "text-muted-foreground"}`} />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>{expandedArticle === hero.id ? "Collapse" : "Read Full Article"}</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>

                  {/* Expanded content for hero */}
                  {expandedArticle === hero.id && hero.content && (
                    <div className="border-t px-5 py-4 sm:px-6">
                      <div
                        className="max-h-96 overflow-auto text-sm prose prose-sm prose-orange max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: sanitize(hero.content) }}
                      />
                    </div>
                  )}
                </Card>
              );
            })()}

            {/* ── Article Grid ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.slice(1).map((article) => (
                <Card
                  key={article.id}
                  className={`group flex flex-col overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                    article.isRead ? "opacity-65 hover:opacity-90" : ""
                  } ${expandedArticle === article.id ? "sm:col-span-2 lg:col-span-3" : ""}`}
                >
                  {/* Image / colored header */}
                  {article.imageUrl ? (
                    <div className="relative h-40 overflow-hidden">
                      <img
                        src={article.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          // Replace broken image with gradient fallback
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          el.parentElement!.classList.add(
                            "bg-gradient-to-br",
                            "from-muted",
                            "to-muted/50"
                          );
                        }}
                      />
                      {/* Unread indicator dot */}
                      {!article.isRead && (
                        <div className="absolute left-3 top-3">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                          </span>
                        </div>
                      )}
                      {/* Bookmark in corner */}
                      <button
                        className="absolute right-2 top-2 rounded-full bg-black/30 p-1.5 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
                        onClick={() => toggleBookmark.mutate(article)}
                      >
                        {article.isBookmarked ? (
                          <BookmarkCheck className="h-3.5 w-3.5 text-yellow-400" />
                        ) : (
                          <Bookmark className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                      <span className="text-3xl">{CAT_ICONS[article.feed.category] || "📰"}</span>
                      {!article.isRead && (
                        <div className="absolute left-3 top-3">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                          </span>
                        </div>
                      )}
                      <button
                        className="absolute right-2 top-2 rounded-full bg-black/20 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => toggleBookmark.mutate(article)}
                      >
                        {article.isBookmarked ? (
                          <BookmarkCheck className="h-3.5 w-3.5 text-yellow-400" />
                        ) : (
                          <Bookmark className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                    </div>
                  )}

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-4">
                    {/* Category + time */}
                    <div className="mb-2 flex items-center gap-2 text-[11px]">
                      <Badge variant="outline" className={`px-1.5 py-0 text-[10px] font-medium ${CAT_COLORS[article.feed.category] || CAT_COLORS.general}`}>
                        {article.feed.title}
                      </Badge>
                      {article.publishedAt && (
                        <Tooltip>
                          <TooltipTrigger className="text-muted-foreground">
                            {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                          </TooltipTrigger>
                          <TooltipContent>
                            {format(new Date(article.publishedAt), "PPP 'at' p")}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Title */}
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-1.5 font-semibold leading-snug tracking-tight transition-colors hover:text-primary line-clamp-2"
                      onClick={() => { if (!article.isRead) markRead.mutate(article.id); }}
                    >
                      {article.title}
                    </a>

                    {/* Summary */}
                    {article.summary && (
                      <p className="mb-3 flex-1 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
                        {stripHtml(article.summary)}
                      </p>
                    )}

                    {/* Expanded content */}
                    {expandedArticle === article.id && article.content && (
                      <div
                        className="mb-3 max-h-80 overflow-auto rounded-lg border bg-muted/20 p-3 text-sm prose prose-sm prose-orange max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: sanitize(article.content) }}
                      />
                    )}

                    {/* Footer */}
                    <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {estimateReadTime(article.summary)}
                        </span>
                        {article.source && article.source !== article.feed.title && (
                          <span className="truncate max-w-[100px]">{article.source}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger
                            className="rounded-md p-1 transition-colors hover:bg-muted"
                            onClick={() => handleExtract(article)}
                            disabled={extractingId === article.id}
                          >
                            {extractingId === article.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : expandedArticle === article.id ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>{expandedArticle === article.id ? "Collapse" : "Read Full Article"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={<a href={article.url} target="_blank" rel="noopener noreferrer" />}
                            className="rounded-md p-1 transition-colors hover:bg-muted"
                            onClick={() => { if (!article.isRead) markRead.mutate(article.id); }}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>Open in new tab</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Stats bar */}
            {articles.length > 0 && (
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {articles.length} articles
                </span>
                <span>{articles.filter((a) => !a.isRead).length} unread</span>
                <span>{articles.filter((a) => a.isBookmarked).length} bookmarked</span>
              </div>
            )}
          </div>
        </TooltipProvider>
      )}

      {/* Load more */}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Load More
          </Button>
        </div>
      )}

      {/* ── Add Custom Feed Dialog ── */}
      <Dialog open={addFeedOpen} onOpenChange={(o) => !o && setAddFeedOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Custom RSS Feed</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (feedUrl.trim()) addFeed.mutate({ url: feedUrl, category: feedCategory });
            }}
          >
            <div className="space-y-1">
              <Label>Feed URL *</Label>
              <Input
                required
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://example.com/rss.xml"
                type="url"
              />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={feedCategory} onValueChange={(v) => setFeedCategory(v ?? "general")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddFeedOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addFeed.isPending}>
                {addFeed.isPending ? "Adding..." : "Add Feed"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
  general: "bg-gray-100 text-gray-700",
  industry: "bg-orange-100 text-orange-700",
  tech: "bg-orange-100 text-orange-700",
  finance: "bg-green-100 text-green-700",
  career: "bg-purple-100 text-purple-700",
};

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

  const { data: articles = [], isLoading: articlesLoading } = useQuery<ResearchArticle[]>({
    queryKey: ["research-articles", filterFeed, filterType, searchQ],
    queryFn: () =>
      fetch(`/api/research-articles?${articleParams.toString()}`).then((r) => r.json()),
  });

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
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : articles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Rss className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {feeds.length === 0
                ? "Add some feeds above, then refresh to see articles."
                : "No articles found. Try refreshing or adjusting filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Card
              key={article.id}
              className={`transition-colors ${article.isRead ? "opacity-70" : ""}`}
            >
              <CardContent className="flex gap-3 p-4">
                {/* Image thumbnail */}
                {article.imageUrl && (
                  <div className="hidden shrink-0 sm:block">
                    <img
                      src={article.imageUrl}
                      alt=""
                      className="h-20 w-28 rounded object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium leading-tight hover:underline"
                      onClick={() => {
                        if (!article.isRead) markRead.mutate(article.id);
                      }}
                    >
                      {article.title}
                    </a>
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="rounded p-1 hover:bg-muted"
                        onClick={() => toggleBookmark.mutate(article)}
                      >
                        {article.isBookmarked ? (
                          <BookmarkCheck className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <Bookmark className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    </div>
                  </div>

                  {article.summary && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {stripHtml(article.summary)}
                    </p>
                  )}

                  {/* Extracted full content */}
                  {expandedArticle === article.id && article.content && (
                    <div
                      className="mt-2 max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-sm prose prose-sm prose-orange max-w-none"
                      dangerouslySetInnerHTML={{ __html: article.content }}
                    />
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <button
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted text-xs font-medium"
                      onClick={() => handleExtract(article)}
                      disabled={extractingId === article.id}
                    >
                      {extractingId === article.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      {expandedArticle === article.id ? "Collapse" : "Read Full"}
                    </button>
                    <Badge
                      className={`text-xs ${CAT_COLORS[article.feed.category] || CAT_COLORS.general}`}
                    >
                      {article.feed.title}
                    </Badge>
                    {article.source && article.source !== article.feed.title && (
                      <span>{article.source}</span>
                    )}
                    {article.publishedAt && (
                      <span>
                        {formatDistanceToNow(new Date(article.publishedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Play, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface VideoItem {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
  category?: string;
  source?: "youtube" | "dailymotion";
}

interface VideosResponse {
  videos: VideoItem[];
  categories: {
    category: string;
    query: string;
    count: number;
    cached: boolean;
  }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  career: "Career",
  tools: "Tools & Tech",
  skills: "Skills",
  industry: "Industry",
  general: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  career: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  tools: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  skills: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  industry: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  general: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
};

const CATEGORY_ACTIVE: Record<string, string> = {
  career: "bg-blue-600 text-white dark:bg-blue-500",
  tools: "bg-purple-600 text-white dark:bg-purple-500",
  skills: "bg-emerald-600 text-white dark:bg-emerald-500",
  industry: "bg-amber-600 text-white dark:bg-amber-500",
  general: "bg-gray-600 text-white dark:bg-gray-500",
};

const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  dailymotion: "Dailymotion",
};

const SOURCE_COLORS: Record<string, string> = {
  youtube: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  dailymotion: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
};

function getVideoUrl(video: VideoItem): string {
  if (video.source === "dailymotion") {
    return `https://www.dailymotion.com/video/${encodeURIComponent(video.videoId)}`;
  }
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
}

function decodeHtmlEntities(text: string): string {
  const textarea = typeof document !== "undefined" ? document.createElement("textarea") : null;
  if (!textarea) return text;
  textarea.innerHTML = text;
  return textarea.value;
}

export function VideoFeed() {
  const [searchInput, setSearchInput] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<"youtube" | "dailymotion" | null>(null);

  // Profile-based feed (default)
  const { data: profileData, isLoading: profileLoading, isError: profileError, refetch: profileRefetch, isFetching: profileFetching } = useQuery<VideosResponse>({
    queryKey: ["video-feed"],
    queryFn: async () => {
      const r = await fetch("/api/videos");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Custom search query
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = useQuery<VideosResponse>({
    queryKey: ["video-search", customQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ q: customQuery, category: "general" });
      const r = await fetch(`/api/videos?${params}`);
      if (!r.ok) throw new Error("search failed");
      return r.json();
    },
    enabled: customQuery.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const isSearchMode = customQuery.length > 0;
  const data = isSearchMode ? searchData : profileData;
  const isLoading = isSearchMode ? searchLoading : profileLoading;
  const isFetching = isSearchMode ? searchFetching : profileFetching;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchInput.trim();
    if (q.length > 0) {
      setCustomQuery(q);
      setActiveCategory(null);
      setActiveSource(null);
    }
  }

  function clearSearch() {
    setSearchInput("");
    setCustomQuery("");
    setActiveCategory(null);
    setActiveSource(null);
  }

  // Client-side filtering
  const filteredVideos = useMemo(() => {
    if (!data?.videos) return [];
    let vids = data.videos;
    if (activeCategory) {
      vids = vids.filter((v) => v.category === activeCategory);
    }
    if (activeSource) {
      vids = vids.filter((v) => v.source === activeSource);
    }
    return vids.slice(0, 12);
  }, [data?.videos, activeCategory, activeSource]);

  // Unique categories from current data
  const availableCategories = useMemo(() => {
    if (!data?.categories) return [];
    return data.categories;
  }, [data?.categories]);

  // Source counts
  const sourceCounts = useMemo(() => {
    if (!data?.videos) return { youtube: 0, dailymotion: 0 };
    let vids = data.videos;
    if (activeCategory) {
      vids = vids.filter((v) => v.category === activeCategory);
    }
    return {
      youtube: vids.filter((v) => v.source === "youtube").length,
      dailymotion: vids.filter((v) => v.source === "dailymotion").length,
    };
  }, [data?.videos, activeCategory]);

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onSubmit={handleSearch}
          onClear={clearSearch}
          isSearchMode={isSearchMode}
          isFetching={false}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-gray-800 rounded-t-lg" />
              <CardContent className="p-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (profileError && !isSearchMode) {
    return (
      <div className="space-y-3">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          onSubmit={handleSearch}
          onClear={clearSearch}
          isSearchMode={isSearchMode}
          isFetching={false}
        />
        <Card>
          <CardContent className="py-8 text-center">
            <Play className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Failed to load videos. Try searching manually above.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <SearchBar
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={handleSearch}
        onClear={clearSearch}
        isSearchMode={isSearchMode}
        isFetching={isFetching}
      />

      {/* Filters row: categories + source toggle + refresh */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {/* "All" pill */}
          <button
            onClick={() => { setActiveCategory(null); setActiveSource(null); }}
            className={`inline-flex items-center rounded-full text-[11px] px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
              !activeCategory
                ? "bg-orange-600 text-white dark:bg-orange-500"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
            }`}
          >
            All
            <span className="ml-1 opacity-70">{data?.videos?.length ?? 0}</span>
          </button>

          {/* Category pills */}
          {availableCategories.map((cat) => (
            <button
              key={cat.category}
              onClick={() => {
                setActiveCategory(activeCategory === cat.category ? null : cat.category);
                setActiveSource(null);
              }}
              className={`inline-flex items-center rounded-full text-[11px] px-2.5 py-0.5 font-medium transition-colors cursor-pointer ${
                activeCategory === cat.category
                  ? CATEGORY_ACTIVE[cat.category] ?? CATEGORY_ACTIVE.general
                  : `${CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS.general} hover:opacity-80`
              }`}
            >
              {CATEGORY_LABELS[cat.category] ?? cat.category}
              <span className="ml-1 opacity-70">{cat.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Source toggles */}
          {(["youtube", "dailymotion"] as const).map((src) => {
            const count = sourceCounts[src];
            if (count === 0 && activeSource !== src) return null;
            return (
              <button
                key={src}
                onClick={() => setActiveSource(activeSource === src ? null : src)}
                className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                  activeSource === src
                    ? src === "youtube"
                      ? "bg-red-600 text-white dark:bg-red-500"
                      : "bg-sky-600 text-white dark:bg-sky-500"
                    : `${SOURCE_COLORS[src]} hover:opacity-80`
                }`}
              >
                {SOURCE_LABELS[src]}
                <span className="ml-1 opacity-70">{count}</span>
              </button>
            );
          })}

          {/* Refresh */}
          {!isSearchMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => profileRefetch()}
              disabled={profileFetching}
              className="h-7 text-xs gap-1 text-muted-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${profileFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Active search indicator */}
      {isSearchMode && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Search className="h-3 w-3" />
          <span>
            Results for &ldquo;<span className="font-medium text-foreground">{customQuery}</span>&rdquo;
            {data?.videos ? ` (${data.videos.length} found)` : ""}
          </span>
          <button onClick={clearSearch} className="ml-1 text-orange-600 hover:underline dark:text-orange-400">
            Back to feed
          </button>
        </div>
      )}

      {/* Video grid */}
      {filteredVideos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Play className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {isFetching ? "Searching..." : "No videos match your filters. Try a different search or clear filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVideos.map((video) => (
            <a
              key={`${video.source ?? "yt"}:${video.videoId}`}
              href={getVideoUrl(video)}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <Card className="overflow-hidden transition-shadow hover:shadow-md h-full">
                <div className="relative aspect-video bg-gray-100 dark:bg-gray-800">
                  {video.thumbnail ? (
                    <img
                      src={video.thumbnail}
                      alt={decodeHtmlEntities(video.title)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Play className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <div className={`h-10 w-10 rounded-full ${video.source === "dailymotion" ? "bg-sky-600/90" : "bg-red-600/90"} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg`}>
                      <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute top-2 left-2 flex gap-1">
                    {video.source && (
                      <Badge
                        className={`text-[9px] px-1.5 py-0 ${SOURCE_COLORS[video.source] ?? SOURCE_COLORS.youtube}`}
                      >
                        {SOURCE_LABELS[video.source] ?? video.source}
                      </Badge>
                    )}
                    {video.category && (
                      <Badge
                        className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[video.category] ?? CATEGORY_COLORS.general}`}
                      >
                        {CATEGORY_LABELS[video.category] ?? video.category}
                      </Badge>
                    )}
                  </div>
                </div>

                <CardContent className="p-3 space-y-1">
                  <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                    {decodeHtmlEntities(video.title)}
                  </h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {video.channel}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(video.publishedAt), { addSuffix: true })}
                  </p>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  isSearchMode,
  isFetching,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  isSearchMode: boolean;
  isFetching: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search videos — e.g. React hooks, system design, Python..."
          className="pl-8 pr-8 h-8 text-sm"
        />
        {(value || isSearchMode) && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={!value.trim() || isFetching}
        className="h-8 px-3 text-xs bg-orange-600 hover:bg-orange-700 text-white"
      >
        {isFetching ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Search"}
      </Button>
    </form>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, ExternalLink, RefreshCw } from "lucide-react";
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
  const { data, isLoading, isError, refetch, isFetching } = useQuery<VideosResponse>({
    queryKey: ["video-feed"],
    queryFn: async () => {
      const r = await fetch("/api/videos");
      if (!r.ok) throw new Error("fetch failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min client-side
    retry: 1,
  });

  if (isLoading) {
    return (
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
    );
  }

  if (isError || !data?.videos?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Play className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {isError
              ? "Failed to load videos. Check your YouTube API key."
              : "No videos available. Add a YouTube API key to your .env to enable this feed."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Category tags + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {data.categories?.map((cat) => (
            <Badge
              key={cat.category}
              className={`text-[10px] px-2 py-0.5 ${CATEGORY_COLORS[cat.category] ?? CATEGORY_COLORS.general}`}
            >
              {CATEGORY_LABELS[cat.category] ?? cat.category}
              <span className="ml-1 opacity-70">{cat.count}</span>
            </Badge>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 text-xs gap-1 text-muted-foreground"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Video grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.videos.slice(0, 12).map((video) => (
          <a
            key={`${video.source ?? "yt"}:${video.videoId}`}
            href={getVideoUrl(video)}
            target="_blank"
            rel="noopener noreferrer"
            className="group block"
          >
            <Card className="overflow-hidden transition-shadow hover:shadow-md h-full">
              {/* Thumbnail */}
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
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <div className={`h-10 w-10 rounded-full ${video.source === "dailymotion" ? "bg-sky-600/90" : "bg-red-600/90"} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg`}>
                    <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
                {/* Badges */}
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
    </div>
  );
}

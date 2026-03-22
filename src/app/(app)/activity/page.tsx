"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Briefcase,
  CalendarDays,
  Users,
  Zap,
  FileText,
  Target,
  Award,
  File,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow, format } from "date-fns";

const ENTITY_ICONS: Record<string, React.ElementType> = {
  application: Briefcase,
  interview: CalendarDays,
  contact: Users,
  skill: Zap,
  certification: Award,
  resume: FileText,
  goal: Target,
  document: File,
};

const ENTITY_COLORS: Record<string, string> = {
  application: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  interview: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  contact: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  skill: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  certification: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  resume: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  goal: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300",
  document: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  status_changed: "Status Changed",
  deleted: "Deleted",
};

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  metadata: string | null;
  createdAt: string;
}

interface ActivityResponse {
  items: ActivityItem[];
  nextCursor: string | null;
}

export default function ActivityPage() {
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<ActivityItem[]>([]);

  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: ["activity", entityFilter, actionFilter, cursor],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entityFilter !== "all") params.set("entityType", entityFilter);
      if (actionFilter !== "all") params.set("action", actionFilter);
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();
      if (cursor) {
        setAllItems((prev) => [...prev, ...data.items]);
      } else {
        setAllItems(data.items);
      }
      return data;
    },
  });

  // Reset cursor when filters change
  const handleFilterChange = (type: "entity" | "action", value: string) => {
    setCursor(null);
    setAllItems([]);
    if (type === "entity") setEntityFilter(value);
    else setActionFilter(value);
  };

  // Group items by date
  const grouped = allItems.reduce<Record<string, ActivityItem[]>>((acc, item) => {
    const date = format(new Date(item.createdAt), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-600" />
            Activity Timeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all changes across your career data
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={entityFilter} onValueChange={(v) => handleFilterChange("entity", v ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Entity type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="application">Applications</SelectItem>
              <SelectItem value="interview">Interviews</SelectItem>
              <SelectItem value="contact">Contacts</SelectItem>
              <SelectItem value="skill">Skills</SelectItem>
              <SelectItem value="certification">Certifications</SelectItem>
              <SelectItem value="resume">Resumes</SelectItem>
              <SelectItem value="goal">Goals</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={actionFilter} onValueChange={(v) => handleFilterChange("action", v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
            <SelectItem value="status_changed">Status Changed</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading && allItems.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : allItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No activity recorded yet. Actions like creating applications, updating goals, and uploading documents will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 sticky top-0 bg-background py-1">
                {format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
              </h3>
              <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-3 space-y-4">
                {grouped[date].map((item) => {
                  const Icon = ENTITY_ICONS[item.entityType] || Clock;
                  const color = ENTITY_COLORS[item.entityType] || ENTITY_COLORS.document;
                  return (
                    <div key={item.id} className="relative pl-6">
                      <div className={`absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${color}`}>
                        <Icon className="h-2.5 w-2.5" />
                      </div>
                      <Card className="transition-colors hover:bg-muted/50">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={color} variant="secondary">
                              {item.entityType}
                            </Badge>
                            <Badge variant="outline">
                              {ACTION_LABELS[item.action] || item.action}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{item.description}</p>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {data?.nextCursor && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setCursor(data.nextCursor)}>
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

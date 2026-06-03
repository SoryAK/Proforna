"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, X, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface Reminder {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  remindAt: string;
  isDismissed: boolean;
  snoozedUntil: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["reminders"],
    queryFn: () => fetch("/api/reminders").then((r) => r.json()),
    refetchInterval: 60_000, // Poll every minute
  });

  const now = new Date();
  const dueReminders = reminders.filter(
    (r) => new Date(r.remindAt) <= now && !r.isDismissed
  );
  const upcomingReminders = reminders.filter(
    (r) => new Date(r.remindAt) > now && !r.isDismissed
  );
  const allActive = [...dueReminders, ...upcomingReminders];

  const dismissMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const snoozeMut = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", snoozeMinutes: 60 }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const entityLabel: Record<string, string> = {
    interview: "Interview",
    goal: "Goal",
    certification: "Certification",
    contact: "Contact",
    application: "Application",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative h-10 w-10" />}>
        <Bell className="h-5 w-5" />
        {dueReminders.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {dueReminders.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {allActive.length === 0
              ? "All caught up!"
              : `${dueReminders.length} due now, ${upcomingReminders.length} upcoming`}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {allActive.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <Bell className="mb-2 h-8 w-8" />
              <p className="text-sm">No active reminders</p>
            </div>
          ) : (
            allActive.map((r) => {
              const isDue = new Date(r.remindAt) <= now;
              return (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 border-b px-4 py-3 last:border-0 ${
                    isDue ? "bg-red-50/50 dark:bg-red-950/20" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {entityLabel[r.entityType] ?? r.entityType}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {isDue
                          ? `Due ${formatDistanceToNow(new Date(r.remindAt), { addSuffix: true })}`
                          : `In ${formatDistanceToNow(new Date(r.remindAt))}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Snooze 1hr"
                      onClick={() => snoozeMut.mutate(r.id)}
                    >
                      <Clock className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Dismiss"
                      onClick={() => dismissMut.mutate(r.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

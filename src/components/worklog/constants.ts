/**
 * Worklog constants — category + mood metadata, shared by worklog page,
 * quick-log dialog, and any future surfaces that render WorkLog entries.
 *
 * Pure module: no React, no side effects. Safe to import anywhere.
 */

import {
  ClipboardList,
  FolderKanban,
  Users,
  BookOpen,
  Wrench,
  Phone,
  Bug,
  MoreHorizontal,
  Smile,
  Meh,
  Frown,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

export interface CategoryMeta {
  label: string;
  icon: React.ElementType;
  /** Tailwind class string for the icon chip background + text. */
  color: string;
}

export const CATEGORIES: Record<string, CategoryMeta> = {
  task:           { label: "Task",        icon: ClipboardList, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  project:        { label: "Project",     icon: FolderKanban,  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  meeting:        { label: "Meeting",     icon: Users,         color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  training:       { label: "Training",    icon: BookOpen,      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  administrative: { label: "Admin",       icon: FolderKanban,  color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  maintenance:     { label: "Maintenance",    icon: Wrench,        color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  troubleshooting: { label: "Troubleshooting", icon: Bug,           color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  "on-call":       { label: "On-Call",        icon: Phone,         color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  other:           { label: "Other",          icon: MoreHorizontal, color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

export interface MoodMeta {
  value: string;
  label: string;
  icon: React.ElementType;
  /** Tailwind text-color class. */
  color: string;
}

export const MOODS: MoodMeta[] = [
  { value: "good",    label: "Good",  icon: Smile, color: "text-emerald-500" },
  { value: "neutral", label: "OK",    icon: Meh,   color: "text-slate-400"   },
  { value: "tough",   label: "Tough", icon: Frown, color: "text-rose-500"    },
];

/** Human-friendly date label: "Today", "Yesterday", or "Mon, Jan 5, 2026". */
export function dateLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d, yyyy");
}

/** Applied to a folder or zone row that is a valid drop target while dragging. */
export const DND_DROP_TARGET_CLASS = "ring-1 ring-ring bg-accent/30";

/** Applied to the row that is actively being dragged (the original, not the overlay). */
export const DND_ACTIVE_ROW_CLASS = "opacity-40";

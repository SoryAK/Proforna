"use client";

import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Section = "snapshot" | "activity" | "evidence" | "direction" | "income" | "goals" | "jobsearch";

const LABELS: Record<Section, string> = {
  snapshot: "Snapshot",
  activity: "Activity",
  evidence: "Evidence",
  direction: "Direction",
  income: "Income",
  goals: "Goals",
  jobsearch: "Job Search",
};

export function CareerAnalyticsBanner({ section, className }: { section: Section; className?: string }) {
  return (
    <Link
      href={`/career-growth#section-${section}`}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-gradient-to-r from-primary/5 to-transparent px-3 py-2 text-sm hover:from-primary/10 transition-colors group",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <BarChart3 className="w-4 h-4 text-primary shrink-0" />
        <span className="text-muted-foreground truncate">
          See this in context on your <span className="text-foreground font-medium">Career Analytics</span> cockpit
        </span>
      </div>
      <span className="flex items-center gap-1 text-xs text-primary font-medium shrink-0">
        Open {LABELS[section]} <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

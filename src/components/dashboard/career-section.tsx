"use client";

import {
  BookOpen,
  Compass,
  TrendingUp,
  Building2,
  Zap,
  FileText,
  MapPin,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { DashboardData } from "./types";

interface CareerSectionProps {
  profile: DashboardData["profile"];
  learningSummary: DashboardData["learningSummary"];
  cdmSummary: DashboardData["cdmSummary"];
  activeGoals: DashboardData["activeGoals"];
  topSkills: DashboardData["topSkills"];
  currentPosition: DashboardData["currentPosition"];
  stats: DashboardData["stats"];
}

export function CareerSection({
  profile,
  learningSummary,
  cdmSummary,
  activeGoals,
  topSkills,
  currentPosition,
  stats,
}: CareerSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="h-4 w-4 text-orange-600" />
        <h2 className="text-base font-semibold text-foreground">Career Development</h2>
      </div>

      {/* About */}
      {profile?.bio && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-semibold">About</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {profile.bio}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Learning Progress */}
        {learningSummary.total > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-orange-500" />
                  Learning Progress
                </CardTitle>
                <Link href="/research" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                  View <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-orange-600">{learningSummary.inProgress}</p>
                  <p className="text-[10px] text-muted-foreground">In Progress</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-600">{learningSummary.completed}</p>
                  <p className="text-[10px] text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{learningSummary.totalHours}</p>
                  <p className="text-[10px] text-muted-foreground">Hours</p>
                </div>
              </div>
              {learningSummary.recentItems.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    {learningSummary.recentItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{item.title}</p>
                          {item.provider && (
                            <p className="text-[10px] text-muted-foreground">{item.provider}</p>
                          )}
                        </div>
                        <Progress value={item.progress} className="w-12 h-1.5" />
                        <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">
                          {item.progress}%
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Career Direction */}
        {cdmSummary && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Compass className="h-4 w-4 text-indigo-500" />
                  Career Direction
                </CardTitle>
                <Link href="/career-growth" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                  CDM <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p
                    className={`text-2xl font-bold ${
                      (cdmSummary.overallScore ?? 0) >= 75
                        ? "text-emerald-600"
                        : (cdmSummary.overallScore ?? 0) >= 50
                        ? "text-amber-600"
                        : "text-red-500"
                    }`}
                  >
                    {Math.round(cdmSummary.overallScore ?? 0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Overall</p>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>
                    {cdmSummary.pathCount} career path{cdmSummary.pathCount !== 1 ? "s" : ""} tracked
                  </p>
                  <p>
                    Last snapshot:{" "}
                    {formatDistanceToNow(new Date(cdmSummary.capturedAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
              {cdmSummary.paths.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    {cdmSummary.paths.map((p) => (
                      <div key={p.title} className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{p.title}</span>
                        <span
                          className={`font-semibold ${
                            p.score >= 75
                              ? "text-emerald-600"
                              : p.score >= 50
                              ? "text-amber-600"
                              : "text-red-500"
                          }`}
                        >
                          {Math.round(p.score)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Goals */}
      {activeGoals.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Goals</CardTitle>
              <Link href="/goals" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                All <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {activeGoals.map((goal) => {
                const total = goal.milestones.length;
                const done = goal.milestones.filter((m) => m.completed).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={goal.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold truncate">{goal.title}</p>
                      <Badge
                        variant="secondary"
                        className={`text-[11px] px-2 py-0.5 ${
                          goal.priority === "high"
                            ? "bg-red-100 text-red-700"
                            : goal.priority === "medium"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {goal.priority}
                      </Badge>
                    </div>
                    {total > 0 && (
                      <Progress value={pct}>
                        <ProgressLabel className="text-xs">
                          {done}/{total}
                        </ProgressLabel>
                        <ProgressValue />
                      </Progress>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profile snapshot — compact previews */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Experience */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-orange-600" />
                Experience
              </CardTitle>
              <Link href="/experience" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {currentPosition ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold truncate">{currentPosition.role}</p>
                <p className="text-xs text-muted-foreground/80">{currentPosition.company}</p>
                {currentPosition.location && (
                  <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {currentPosition.location}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No current position</p>
            )}
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-600" />
                Skills
              </CardTitle>
              <Link href="/skills" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {topSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {topSkills.slice(0, 6).map((skill) => (
                  <Badge key={skill.id} variant="secondary" className="text-xs px-2 py-0.5">
                    {skill.name}
                  </Badge>
                ))}
                {stats.skills > 6 && (
                  <Badge variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground">
                    +{stats.skills - 6} more
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No skills added yet</p>
            )}
          </CardContent>
        </Card>

        {/* Resumes */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-orange-600" />
                Resumes
              </CardTitle>
              <Link href="/resumes" className="text-xs text-orange-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {stats.resumes > 0 ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold text-orange-600">{stats.resumes}</p>
                <p className="text-xs text-muted-foreground/80">
                  resume{stats.resumes !== 1 ? "s" : ""} on file
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No resumes yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Activity, BarChart3, Award, Briefcase, Calendar, CheckCircle2, Compass, DollarSign,
  ExternalLink, Flame, Github, Layers, NotebookPen, Plug, Sparkles, Target, TrendingUp,
  Wrench, Zap,
} from "lucide-react";
import CareerDirectionModel from "@/components/career-direction-model";
import GoalsPage from "../goals/page";
import CareerModelPage from "../career-model/page";

// ── Types ─────────────────────────────────────────────────────────
type CareerAnalytics = {
  snapshot: {
    activeDays90: number; totalEntries90: number; autoCount90: number; manualCount90: number;
    autoRatePct: number; notableCount90: number; hoursLogged90: number; currentStreak: number;
    skillCount: number; certCount: number; careerEventCount: number; assetCount: number;
    equipmentCount: number; applied: number; offerRate: number; totalInterviews: number;
  };
  activity: {
    weeks: { weekStart: string; entries: number; hours: number; manual: number; auto: number }[];
    sourceMix: Record<string, number>;
    topPositions: { id: string; company: string; title: string | null; entries: number; hours: number }[];
    topAssets: { id: string; name: string; type: string | null; count: number }[];
    topEquipment: { id: string; name: string; category: string | null; count: number }[];
  };
  growth: {
    careerEvents: { id: string; title: string; category: string; startDate: string | null; metrics: string | null; workHistoryId: string | null }[];
    certs: { id: string; name: string; issueDate: string; expiryDate: string | null }[];
    learningHours: number; learningCompleted: number;
    activePosition: { id: string; company: string; title: string | null } | null;
    positionsCount: number;
  };
  income: { years: { year: number; grossIncome: number }[]; latestGross: number | null; cagrPct: number | null; yearsTracked: number };
  goals: { id: string; title: string; status: string; targetDate: string | null; milestonesTotal: number; milestonesDone: number }[];
  jobSearch: { applied: number; statusCounts: Record<string, number>; offers: number; offerRate: number; totalInterviews: number };
  integrations: { total: number; enabled: number; lastSync: string | null; list: { id: string; provider: string; label: string | null; lastSyncedAt: string | null; lastSyncCount: number }[] };
};

const SECTIONS = [
  { id: "snapshot",   label: "Snapshot",   icon: Sparkles },
  { id: "activity",   label: "Activity",   icon: Activity },
  { id: "evidence",   label: "Evidence",   icon: Award },
  { id: "direction",  label: "Direction",  icon: Compass },
  { id: "income",     label: "Income",     icon: DollarSign },
  { id: "goals",      label: "Goals",      icon: Target },
  { id: "jobsearch",  label: "Job Search", icon: Briefcase },
] as const;

const SOURCE_META: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "bg-slate-500" },
  "photo-equipment": { label: "Tool photos", color: "bg-amber-500" },
  "photo-asset": { label: "Asset photos", color: "bg-orange-500" },
  ics: { label: "Calendar", color: "bg-blue-500" },
  github: { label: "GitHub", color: "bg-purple-500" },
  other: { label: "Other auto", color: "bg-zinc-400" },
};

// ── Page ──────────────────────────────────────────────────────────
export default function CareerGrowthPage() {
  const { data, isLoading } = useQuery<CareerAnalytics>({
    queryKey: ["career-analytics"],
    queryFn: () => fetch("/api/career-analytics").then((r) => r.json()),
    staleTime: 60_000,
  });

  const [active, setActive] = useState<string>("snapshot");

  const handleNav = (id: string) => {
    setActive(id);
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sticky left rail (desktop) / top pills (mobile) */}
      <aside className="lg:w-56 lg:shrink-0 lg:border-r bg-card/30 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="p-4 hidden lg:block">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Career Analytics</h2>
          <nav className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => handleNav(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left ${
                    active === s.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" /> {s.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="lg:hidden border-b overflow-x-auto">
          <div className="flex gap-1 p-2 min-w-max">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => handleNav(s.id)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full whitespace-nowrap ${active === s.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <Icon className="w-3 h-3" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 lg:p-8 space-y-12">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary" /> Career Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything we know about your career — pulled live from worklog, skills, jobs, integrations, income, and goals.
          </p>
        </div>

        <SnapshotSection id="snapshot" data={data?.snapshot} integrations={data?.integrations} loading={isLoading} />
        <ActivitySection id="activity" activity={data?.activity} loading={isLoading} />
        <EvidenceSection id="evidence" data={data} loading={isLoading} />

        <Section id="direction" icon={Compass} title="Direction" subtitle="Where you're headed and how close you are" deepLink="/career-model">
          <CareerDirectionModel />
        </Section>

        <Section id="income" icon={DollarSign} title="Income" subtitle="Earnings history, projections, and wage tier goals" deepLink="/career-model">
          <CareerModelPage />
        </Section>

        <Section id="goals" icon={Target} title="Goals" subtitle="Active goals and milestones" deepLink="/goals">
          <GoalsPage />
        </Section>

        <JobSearchSection id="jobsearch" data={data?.jobSearch} loading={isLoading} />
      </main>
    </div>
  );
}

function Section({ id, icon: Icon, title, subtitle, deepLink, children }: {
  id: string; icon: React.ElementType; title: string; subtitle?: string; deepLink?: string; children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-4 space-y-4">
      <div className="flex items-end justify-between border-b pb-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Icon className="w-5 h-5 text-primary" /> {title}
          </h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {deepLink && (
          <Button variant="ghost" size="sm" render={<Link href={deepLink} />}>
            Open full view <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function SnapshotSection({ id, data, integrations, loading }: { id: string; data?: CareerAnalytics["snapshot"]; integrations?: CareerAnalytics["integrations"]; loading: boolean }) {
  if (loading || !data) {
    return (
      <Section id={id} icon={Sparkles} title="Snapshot" subtitle="Last 90 days at a glance">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </Section>
    );
  }
  const tiles: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string }[] = [
    { icon: Flame, label: "Current streak", value: `${data.currentStreak}d`, color: "text-orange-600", sub: `${data.activeDays90} active days · 90d` },
    { icon: NotebookPen, label: "Worklog entries", value: data.totalEntries90, color: "text-sky-600", sub: `${data.hoursLogged90}h logged · 90d` },
    { icon: Sparkles, label: "Auto-capture rate", value: `${data.autoRatePct}%`, color: "text-violet-600", sub: `${data.autoCount90} auto / ${data.manualCount90} manual` },
    { icon: Zap, label: "Notable events", value: data.notableCount90, color: "text-amber-600", sub: `${data.careerEventCount} promoted to career` },
    { icon: Layers, label: "Skills tracked", value: data.skillCount, color: "text-emerald-600", sub: `${data.certCount} certifications` },
    { icon: Wrench, label: "Tools & assets", value: data.equipmentCount + data.assetCount, color: "text-indigo-600", sub: `${data.equipmentCount} tools · ${data.assetCount} assets` },
    { icon: Briefcase, label: "Applications", value: data.applied, color: "text-cyan-600", sub: `${data.totalInterviews} interviews` },
    { icon: TrendingUp, label: "Offer rate", value: `${data.offerRate}%`, color: "text-green-600", sub: integrations?.enabled ? `${integrations.enabled} integrations on` : "No integrations" },
  ];
  return (
    <Section id={id} icon={Sparkles} title="Snapshot" subtitle="Last 90 days at a glance">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <Card key={i} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${t.color}`}>{t.value}</p>
                    {t.sub && <p className="text-xs text-muted-foreground mt-1 truncate">{t.sub}</p>}
                  </div>
                  <Icon className={`w-5 h-5 ${t.color} opacity-60 shrink-0`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}

function ActivitySection({ id, activity, loading }: { id: string; activity?: CareerAnalytics["activity"]; loading: boolean }) {
  const maxHours = useMemo(() => Math.max(1, ...(activity?.weeks ?? []).map((w) => w.hours)), [activity]);
  const totalSourceCount = useMemo(() => Object.values(activity?.sourceMix ?? {}).reduce((s, n) => s + n, 0) || 1, [activity]);

  if (loading || !activity) {
    return (
      <Section id={id} icon={Activity} title="Activity" subtitle="Where your time goes — last 12 weeks" deepLink="/worklog">
        <Skeleton className="h-64" />
      </Section>
    );
  }

  const allZeroSources = Object.values(activity.sourceMix).every((n) => n === 0);

  return (
    <Section id={id} icon={Activity} title="Activity" subtitle="Where your time goes — last 12 weeks" deepLink="/worklog">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Hours per week</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-40">
              {activity.weeks.map((w, i) => {
                const h = Math.max(2, (w.hours / maxHours) * 140);
                const autoH = w.entries > 0 ? (w.auto / w.entries) * h : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`Week of ${w.weekStart}: ${w.hours.toFixed(1)}h · ${w.entries} entries (${w.auto} auto)`}>
                    <div className="w-full rounded-t-sm flex flex-col-reverse overflow-hidden" style={{ height: `${h}px` }}>
                      <div className="bg-sky-500" style={{ height: `${h - autoH}px` }} />
                      <div className="bg-violet-400" style={{ height: `${autoH}px` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{w.weekStart.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-sky-500 rounded-sm" /> Manual</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-violet-400 rounded-sm" /> Auto</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Plug className="w-4 h-4" /> Source mix</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {allZeroSources ? (
              <p className="text-xs text-muted-foreground">No activity yet. <Link href="/integrations" className="underline">Connect a calendar or GitHub</Link> to start auto-capturing.</p>
            ) : (
              Object.entries(activity.sourceMix).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([key, n]) => {
                const meta = SOURCE_META[key] ?? { label: key, color: "bg-zinc-400" };
                const pct = Math.round((n / totalSourceCount) * 100);
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        {key === "github" && <Github className="w-3 h-3" />}
                        {key === "ics" && <Calendar className="w-3 h-3" />}
                        {meta.label}
                      </span>
                      <span className="text-muted-foreground">{n} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${meta.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-4">
        <TopList title="Top positions" icon={Briefcase} items={activity.topPositions.map((p) => ({ id: p.id, primary: p.title || p.company, secondary: p.title ? p.company : null, count: p.entries, suffix: `${p.hours}h` }))} emptyMsg="No position-tagged entries yet." />
        <TopList title="Assets touched" icon={Wrench} items={activity.topAssets.map((a) => ({ id: a.id, primary: a.name, secondary: a.type, count: a.count, suffix: "days" }))} emptyMsg="Upload a photo to a job asset to start tracking." link="/job-assets" />
        <TopList title="Tools used" icon={Wrench} items={activity.topEquipment.map((e) => ({ id: e.id, primary: e.name, secondary: e.category, count: e.count, suffix: "days" }))} emptyMsg="Upload a photo to your tools to start tracking." link="/inventory" />
      </div>
    </Section>
  );
}

function TopList({ title, icon: Icon, items, emptyMsg, link }: {
  title: string; icon: React.ElementType;
  items: { id: string; primary: string; secondary: string | null; count: number; suffix: string }[];
  emptyMsg: string; link?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Icon className="w-4 h-4" /> {title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyMsg}{link && <> <Link href={link} className="underline">Go →</Link></>}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{it.primary}</div>
                  {it.secondary && <div className="text-xs text-muted-foreground truncate">{it.secondary}</div>}
                </div>
                <Badge variant="secondary" className="shrink-0">{it.count} {it.suffix}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceSection({ id, data, loading }: { id: string; data?: CareerAnalytics; loading: boolean }) {
  if (loading || !data) {
    return (
      <Section id={id} icon={Award} title="Evidence" subtitle="What backs up your career claims" deepLink="/skill-graph">
        <Skeleton className="h-48" />
      </Section>
    );
  }
  const { growth, snapshot } = data;
  return (
    <Section id={id} icon={Award} title="Evidence" subtitle="What backs up your career claims" deepLink="/skill-graph">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Career events</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-2">{snapshot.careerEventCount}</p>
            {growth.careerEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">Promote a notable worklog entry to a career event.</p>
            ) : (
              <ul className="space-y-1.5">
                {growth.careerEvents.slice(0, 5).map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="font-medium truncate">{e.title}</div>
                    <div className="text-muted-foreground">{e.startDate ?? ""} · {e.category}{e.metrics ? ` · ${e.metrics}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Award className="w-4 h-4" /> Certifications</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-2">{snapshot.certCount}</p>
            {growth.certs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No certs yet. <Link href="/profile" className="underline">Add one</Link>.</p>
            ) : (
              <ul className="space-y-1.5">
                {growth.certs.map((c) => (
                  <li key={c.id} className="text-xs">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-muted-foreground">Issued {new Date(c.issueDate).getFullYear()}{c.expiryDate ? ` · expires ${new Date(c.expiryDate).getFullYear()}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Layers className="w-4 h-4" /> Learning</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold mb-1">{growth.learningHours}h</p>
            <p className="text-xs text-muted-foreground mb-2">{growth.learningCompleted} courses completed</p>
            <Button variant="outline" size="sm" className="w-full" render={<Link href="/learning" />}>Open learning <ExternalLink className="w-3 h-3 ml-1" /></Button>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function JobSearchSection({ id, data, loading }: { id: string; data?: CareerAnalytics["jobSearch"]; loading: boolean }) {
  if (loading || !data) {
    return (
      <Section id={id} icon={Briefcase} title="Job Search" subtitle="Application funnel and outcomes" deepLink="/analytics">
        <Skeleton className="h-32" />
      </Section>
    );
  }
  const statuses = Object.entries(data.statusCounts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...statuses.map(([, n]) => n));
  return (
    <Section id={id} icon={Briefcase} title="Job Search" subtitle="Application funnel and outcomes" deepLink="/analytics">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Applications</p>
            <p className="text-3xl font-bold">{data.applied}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.totalInterviews} interviews scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Offers</p>
            <p className="text-3xl font-bold text-green-600">{data.offers}</p>
            <p className="text-xs text-muted-foreground mt-1">{data.offerRate}% offer rate</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Status breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {statuses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No applications tracked yet.</p>
            ) : statuses.map(([status, n]) => (
              <div key={status}>
                <div className="flex items-center justify-between text-xs"><span className="capitalize">{status}</span><span className="text-muted-foreground">{n}</span></div>
                <Progress value={(n / max) * 100} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

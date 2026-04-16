"use client";

import { useMemo } from "react";
import {
  BarChart3,
  Brain,
  Link2,
  Zap,
  Target,
  TrendingUp,
  AlertTriangle,
  Briefcase,
  Award,
  BookOpen,
  FileText,
  Hexagon,
  Network,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Types (mirrored from skill-graph) ── */

interface SkillNode {
  id: string;
  name: string;
  type: string;
  source: string;
  metadata: string | null;
  evidence: SkillEvidence[];
  createdAt: string;
}

interface SkillEdge {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  weight: number;
  source: string;
  metadata: string | null;
}

interface SkillEvidence {
  id: string;
  skillNodeId: string;
  artifactType: string;
  artifactId: string | null;
  strength: number;
  notes: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

interface OccupationData {
  id: string;
  socCode: string;
  title: string;
  description: string | null;
  cluster: string;
  source: string;
  requirements: { skillNodeId: string; importance: number; level: number }[];
  interests: { status: string; fitScore: number | null }[];
}

interface GraphData {
  nodes: SkillNode[];
  edges: SkillEdge[];
  evidence: SkillEvidence[];
  occupations: OccupationData[];
}

/* ── Constants ── */

const TYPE_COLORS: Record<string, string> = {
  technical: "#3b82f6",
  domain: "#8b5cf6",
  tool: "#f59e0b",
  soft: "#10b981",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  prerequisite: "#ef4444",
  peer: "#6b7280",
  bridge: "#f59e0b",
  child: "#8b5cf6",
  enables: "#10b981",
  requires: "#f43f5e",
};

const ARTIFACT_META: Record<string, { label: string; icon: typeof Briefcase; color: string }> = {
  work_history: { label: "Work History", icon: Briefcase, color: "#3b82f6" },
  certification: { label: "Certification", icon: Award, color: "#f59e0b" },
  learning_item: { label: "Learning", icon: BookOpen, color: "#8b5cf6" },
  project: { label: "Project", icon: FileText, color: "#10b981" },
  self_assessed: { label: "Self-Assessed", icon: Target, color: "#6b7280" },
};

const STRENGTH_TIERS = [
  { label: "None", min: 0, max: 0, color: "#6b7280", bg: "bg-gray-500/20" },
  { label: "Beginner", min: 1, max: 30, color: "#ef4444", bg: "bg-red-500/20" },
  { label: "Developing", min: 31, max: 55, color: "#f59e0b", bg: "bg-amber-500/20" },
  { label: "Proficient", min: 56, max: 79, color: "#3b82f6", bg: "bg-blue-500/20" },
  { label: "Expert", min: 80, max: 100, color: "#10b981", bg: "bg-emerald-500/20" },
];

/* ── Helpers ── */

function pct(n: number, d: number) {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

function maxEvidence(ev: SkillEvidence[]): number {
  return ev.length > 0 ? Math.max(...ev.map((e) => e.strength)) : 0;
}

/* ── Bar component ── */

function Bar({ value, max, color, label, count }: { value: number; max: number; color: string; label: string; count: number }) {
  const w = max === 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 truncate text-muted-foreground">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-xs font-medium">{count}</span>
    </div>
  );
}

/* ── Main Component ── */

export default function SkillGraphAnalytics({ data }: { data: GraphData }) {
  const analytics = useMemo(() => {
    const { nodes, edges, evidence, occupations } = data;

    // --- Basic counts ---
    const totalNodes = nodes.length;
    const totalEdges = edges.length;
    const totalEvidence = evidence.length;
    const totalOccupations = occupations.length;

    // --- Skill type distribution ---
    const typeDistribution: Record<string, number> = {};
    for (const n of nodes) {
      typeDistribution[n.type] = (typeDistribution[n.type] ?? 0) + 1;
    }

    // --- Source distribution ---
    const sourceDistribution: Record<string, number> = {};
    for (const n of nodes) {
      sourceDistribution[n.source] = (sourceDistribution[n.source] ?? 0) + 1;
    }

    // --- Edge type distribution ---
    const edgeTypeDistribution: Record<string, number> = {};
    for (const e of edges) {
      edgeTypeDistribution[e.type] = (edgeTypeDistribution[e.type] ?? 0) + 1;
    }

    // --- Evidence coverage ---
    const nodesWithEvidence = new Set(evidence.map((e) => e.skillNodeId));
    const provenCount = nodesWithEvidence.size;
    const coveragePct = pct(provenCount, totalNodes);

    // --- Evidence by artifact type ---
    const artifactDistribution: Record<string, number> = {};
    for (const e of evidence) {
      artifactDistribution[e.artifactType] = (artifactDistribution[e.artifactType] ?? 0) + 1;
    }

    // --- Strength tiers ---
    const strengthMap = new Map<string, number>();
    for (const n of nodes) {
      const nodeEv = evidence.filter((e) => e.skillNodeId === n.id);
      strengthMap.set(n.id, maxEvidence(nodeEv));
    }
    const tierCounts = STRENGTH_TIERS.map((tier) => {
      let count = 0;
      for (const [, s] of strengthMap) {
        if (tier.min === 0 && tier.max === 0) {
          if (s === 0) count++;
        } else if (s >= tier.min && s <= tier.max) {
          count++;
        }
      }
      return { ...tier, count };
    });

    // --- Top skills by evidence strength ---
    const topSkills = nodes
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        strength: strengthMap.get(n.id) ?? 0,
        evidenceCount: evidence.filter((e) => e.skillNodeId === n.id).length,
      }))
      .filter((s) => s.strength > 0)
      .sort((a, b) => b.strength - a.strength || b.evidenceCount - a.evidenceCount)
      .slice(0, 10);

    // --- Hub nodes (most connected) ---
    const degreeMap = new Map<string, number>();
    for (const e of edges) {
      degreeMap.set(e.fromId, (degreeMap.get(e.fromId) ?? 0) + 1);
      degreeMap.set(e.toId, (degreeMap.get(e.toId) ?? 0) + 1);
    }
    const hubNodes = nodes
      .map((n) => ({ id: n.id, name: n.name, type: n.type, degree: degreeMap.get(n.id) ?? 0 }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);

    // --- Occupation readiness ---
    const targetOccupations = occupations.filter(
      (o) => o.interests.some((i) => i.status === "target" || i.status === "current")
    );

    const occupationReadiness = targetOccupations.map((occ) => {
      const reqs = occ.requirements;
      if (reqs.length === 0) return { ...occ, readiness: 0, gaps: [], covered: 0, total: 0 };

      let totalImportanceWeighted = 0;
      let coveredWeighted = 0;
      const gaps: { name: string; importance: number; strength: number }[] = [];

      for (const req of reqs) {
        const node = nodes.find((n) => n.id === req.skillNodeId);
        const strength = strengthMap.get(req.skillNodeId) ?? 0;
        const w = req.importance / 100;
        totalImportanceWeighted += w;
        coveredWeighted += w * (strength / 100);

        if (strength < 50) {
          gaps.push({
            name: node?.name ?? "Unknown",
            importance: req.importance,
            strength,
          });
        }
      }

      const readiness = totalImportanceWeighted > 0
        ? Math.round((coveredWeighted / totalImportanceWeighted) * 100)
        : 0;

      return {
        ...occ,
        readiness,
        gaps: gaps.sort((a, b) => b.importance - a.importance).slice(0, 5),
        covered: reqs.filter((r) => (strengthMap.get(r.skillNodeId) ?? 0) >= 50).length,
        total: reqs.length,
      };
    });

    // --- Cluster coverage ---
    const clusterCounts: Record<string, { total: number; proven: number }> = {};
    for (const n of nodes) {
      // Find which clusters this skill belongs to (via occupation requirements)
      for (const occ of occupations) {
        if (occ.requirements.some((r) => r.skillNodeId === n.id)) {
          if (!clusterCounts[occ.cluster]) clusterCounts[occ.cluster] = { total: 0, proven: 0 };
          clusterCounts[occ.cluster].total++;
          if ((strengthMap.get(n.id) ?? 0) > 0) clusterCounts[occ.cluster].proven++;
        }
      }
    }

    // --- Isolated nodes (no connections) ---
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.fromId);
      connectedIds.add(e.toId);
    }
    const isolatedCount = nodes.filter((n) => !connectedIds.has(n.id)).length;

    // --- Average edge weight ---
    const avgWeight = edges.length > 0
      ? Math.round((edges.reduce((s, e) => s + e.weight, 0) / edges.length) * 10) / 10
      : 0;

    return {
      totalNodes,
      totalEdges,
      totalEvidence,
      totalOccupations,
      typeDistribution,
      sourceDistribution,
      edgeTypeDistribution,
      provenCount,
      coveragePct,
      artifactDistribution,
      tierCounts,
      topSkills,
      hubNodes,
      occupationReadiness,
      clusterCounts,
      isolatedCount,
      avgWeight,
    };
  }, [data]);

  const maxTypeCount = Math.max(...Object.values(analytics.typeDistribution), 1);
  const maxEdgeTypeCount = Math.max(...Object.values(analytics.edgeTypeDistribution), 1);
  const maxArtifactCount = Math.max(...Object.values(analytics.artifactDistribution), 1);
  const maxTierCount = Math.max(...analytics.tierCounts.map((t) => t.count), 1);
  const maxSourceCount = Math.max(...Object.values(analytics.sourceDistribution), 1);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Skills</p>
                  <p className="text-2xl font-bold">{analytics.totalNodes}</p>
                </div>
                <Brain className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {Object.entries(analytics.typeDistribution).map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-[10px] px-1.5 py-0" style={{ borderColor: TYPE_COLORS[type] }}>
                    {count} {type}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Connections</p>
                  <p className="text-2xl font-bold">{analytics.totalEdges}</p>
                </div>
                <Link2 className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Avg weight: {analytics.avgWeight} · {analytics.isolatedCount} isolated
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Evidence Coverage</p>
                  <p className="text-2xl font-bold">{analytics.coveragePct}%</p>
                </div>
                <Zap className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${analytics.coveragePct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {analytics.provenCount} / {analytics.totalNodes} skills proven
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Occupations</p>
                  <p className="text-2xl font-bold">{analytics.totalOccupations}</p>
                </div>
                <Hexagon className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {analytics.occupationReadiness.length} tracked
                {analytics.occupationReadiness.length > 0 && (
                  <> · avg readiness {Math.round(analytics.occupationReadiness.reduce((s, o) => s + o.readiness, 0) / analytics.occupationReadiness.length)}%</>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Charts Row 1 ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Skill Type Distribution */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" /> Skill Types
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(analytics.typeDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Bar key={type} value={count} max={maxTypeCount} color={TYPE_COLORS[type] ?? "#6b7280"} label={type} count={count} />
                ))}
              {Object.keys(analytics.typeDistribution).length === 0 && (
                <p className="text-sm text-muted-foreground">No skills yet</p>
              )}
            </CardContent>
          </Card>

          {/* Edge Type Distribution */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Network className="h-4 w-4" /> Connection Types
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(analytics.edgeTypeDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Bar key={type} value={count} max={maxEdgeTypeCount} color={EDGE_TYPE_COLORS[type] ?? "#6b7280"} label={type} count={count} />
                ))}
              {Object.keys(analytics.edgeTypeDistribution).length === 0 && (
                <p className="text-sm text-muted-foreground">No connections yet</p>
              )}
            </CardContent>
          </Card>

          {/* Evidence by Artifact Type */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-4 w-4" /> Evidence Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(analytics.artifactDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const meta = ARTIFACT_META[type];
                  return (
                    <Bar
                      key={type}
                      value={count}
                      max={maxArtifactCount}
                      color={meta?.color ?? "#6b7280"}
                      label={meta?.label ?? type}
                      count={count}
                    />
                  );
                })}
              {Object.keys(analytics.artifactDistribution).length === 0 && (
                <p className="text-sm text-muted-foreground">No evidence yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Charts Row 2 ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Strength Tiers */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> Proficiency Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {analytics.tierCounts.map((tier) => (
                <Bar key={tier.label} value={tier.count} max={maxTierCount} color={tier.color} label={tier.label} count={tier.count} />
              ))}
            </CardContent>
          </Card>

          {/* Source Distribution */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Brain className="h-4 w-4" /> Skill Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {Object.entries(analytics.sourceDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([source, count]) => {
                  const colors: Record<string, string> = {
                    user: "#3b82f6",
                    market: "#f59e0b",
                    ai: "#8b5cf6",
                    onet: "#10b981",
                  };
                  return (
                    <Bar key={source} value={count} max={maxSourceCount} color={colors[source] ?? "#6b7280"} label={source} count={count} />
                  );
                })}
            </CardContent>
          </Card>

          {/* Cluster Coverage */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Hexagon className="h-4 w-4" /> Cluster Coverage
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2.5">
              {Object.entries(analytics.clusterCounts).length > 0 ? (
                Object.entries(analytics.clusterCounts)
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([cluster, { total, proven }]) => (
                    <div key={cluster} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate text-muted-foreground">{cluster}</span>
                        <span className="text-xs font-medium shrink-0 ml-2">{pct(proven, total)}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct(proven, total)}%` }}
                        />
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-muted-foreground">No clusters seeded yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Lists Row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Proven Skills */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Award className="h-4 w-4" /> Top Proven Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {analytics.topSkills.length > 0 ? (
                <div className="space-y-2">
                  {analytics.topSkills.map((skill, i) => (
                    <div key={skill.id} className="flex items-center gap-2 text-sm">
                      <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[skill.type] ?? "#6b7280" }}
                      />
                      <span className="truncate flex-1">{skill.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {skill.evidenceCount} ev
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>{skill.evidenceCount} evidence items</TooltipContent>
                        </Tooltip>
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${skill.strength}%`,
                              backgroundColor: skill.strength >= 80 ? "#10b981" : skill.strength >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{skill.strength}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No proven skills yet. Use Auto-Link Evidence to get started.</p>
              )}
            </CardContent>
          </Card>

          {/* Hub Nodes (Most Connected) */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Network className="h-4 w-4" /> Most Connected Skills
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {analytics.hubNodes.length > 0 ? (
                <div className="space-y-2">
                  {analytics.hubNodes.map((hub, i) => (
                    <div key={hub.id} className="flex items-center gap-2 text-sm">
                      <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[hub.type] ?? "#6b7280" }}
                      />
                      <span className="truncate flex-1">{hub.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                        {hub.degree} links
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No connections yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Occupation Readiness ── */}
        {analytics.occupationReadiness.length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Target className="h-4 w-4" /> Occupation Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-4">
                {analytics.occupationReadiness.map((occ) => (
                  <div key={occ.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hexagon className="h-4 w-4 text-rose-400" />
                        <span className="text-sm font-medium">{occ.title}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                          {occ.interests[0]?.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-bold" style={{
                        color: occ.readiness >= 70 ? "#10b981" : occ.readiness >= 40 ? "#f59e0b" : "#ef4444",
                      }}>
                        {occ.readiness}%
                      </span>
                    </div>

                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${occ.readiness}%`,
                          backgroundColor: occ.readiness >= 70 ? "#10b981" : occ.readiness >= 40 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{occ.covered} / {occ.total} skills covered</span>
                      {occ.gaps.length > 0 && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          {occ.gaps.length} gap{occ.gaps.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {occ.gaps.length > 0 && (
                      <div className="pl-4 space-y-1">
                        {occ.gaps.map((gap) => (
                          <div key={gap.name} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-amber-500/60" />
                              {gap.name}
                            </span>
                            <span className="text-muted-foreground">
                              {gap.strength}% / {Math.round(gap.importance)}% imp.
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}

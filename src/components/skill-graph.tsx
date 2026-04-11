"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Plus,
  Trash2,
  Zap,
  Eye,
  EyeOff,
  Target,
  Link2,
  FileText,
  Loader2,
  Network,
  Sparkles,
  ArrowRight,
  Briefcase,
  Award,
  BookOpen,
  Globe,
  RefreshCw,
  Check,
  Pencil,
  ScanSearch,
  Hexagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// Dynamically import ForceGraph2D — no SSR (canvas-based)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

/* ── Types ── */

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

interface GraphData {
  nodes: SkillNode[];
  edges: SkillEdge[];
  evidence: SkillEvidence[];
  occupations: OccupationData[];
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

interface ScaffoldCluster {
  name: string;
  socPrefix: string;
  nodeCount: number;
  edgeCount: number;
  occupationCount: number;
  seeded: boolean;
  seededAt: string | null;
  version: string | null;
  currentVersion: string;
  needsRefresh: boolean;
}

interface ScaffoldData {
  clusters: ScaffoldCluster[];
  version: string;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  source: string;
  evidenceCount: number;
  evidenceStrength: number;
  isOccupation: boolean;
  occupationStatus?: string;
  val: number; // node size for force graph
  color: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  color: string;
}

/* ── Constants ── */

const NODE_TYPE_COLORS: Record<string, string> = {
  technical: "#3b82f6",
  domain: "#8b5cf6",
  tool: "#f59e0b",
  soft: "#10b981",
  occupation: "#f43f5e",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  prerequisite: "#ef4444",
  peer: "#6b7280",
  bridge: "#f59e0b",
  child: "#8b5cf6",
  enables: "#10b981",
  requires: "#f43f5e",
};

const EDGE_TYPE_LABELS: Record<string, string> = {
  prerequisite: "Prerequisite",
  peer: "Peer",
  bridge: "Bridge",
  child: "Sub-skill",
  enables: "Enables",
  requires: "Requires",
};

const NODE_TYPES = ["technical", "domain", "tool", "soft"] as const;
const EDGE_TYPES = ["prerequisite", "peer", "bridge", "child", "enables"] as const;
const EVIDENCE_TYPES = [
  { value: "work_history", label: "Work History", icon: Briefcase },
  { value: "certification", label: "Certification", icon: Award },
  { value: "learning_item", label: "Learning", icon: BookOpen },
  { value: "project", label: "Project", icon: FileText },
  { value: "self_assessed", label: "Self-Assessed", icon: Target },
] as const;

/* ── Component ── */

export default function SkillGraph() {
  const qc = useQueryClient();
  const graphRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const containerElRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [showAddEdge, setShowAddEdge] = useState(false);
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showMarketView, setShowMarketView] = useState(true);
  const [showEvidenceView, setShowEvidenceView] = useState(true);
  const [showOccupationView, setShowOccupationView] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Form state
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState<string>("technical");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeType, setEdgeType] = useState<string>("peer");
  const [evidenceNodeId, setEvidenceNodeId] = useState("");
  const [evidenceType, setEvidenceType] = useState("self_assessed");
  const [evidenceStrength, setEvidenceStrength] = useState(50);
  const [evidenceNotes, setEvidenceNotes] = useState("");

  // Fetch graph
  const { data, isLoading } = useQuery<GraphData>({
    queryKey: ["skill-graph"],
    queryFn: () => fetch("/api/skill-graph").then((r) => r.json()),
  });

  // Mutations
  const addNode = useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      fetch("/api/skill-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to create node");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Skill node added");
      setShowAddNode(false);
      setNewNodeName("");
    },
    onError: () => toast.error("Failed to add skill node"),
  });

  const deleteNode = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/skill-graph/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Node removed");
      setSelectedNode(null);
    },
    onError: () => toast.error("Failed to remove node"),
  });

  const addEdge = useMutation({
    mutationFn: (body: { fromId: string; toId: string; type: string }) =>
      fetch("/api/skill-graph/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to create edge");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Connection added");
      setShowAddEdge(false);
    },
    onError: () => toast.error("Failed to add connection"),
  });

  const deleteEdge = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/skill-graph/edges?id=${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete edge");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Connection removed");
    },
    onError: () => toast.error("Failed to remove connection"),
  });

  const addEvidence = useMutation({
    mutationFn: (body: { skillNodeId: string; artifactType: string; strength: number; notes: string }) =>
      fetch("/api/skill-graph/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to add evidence");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Evidence added");
      setShowAddEvidence(false);
      setEvidenceNotes("");
      setEvidenceStrength(50);
    },
    onError: () => toast.error("Failed to add evidence"),
  });

  const deleteEvidence = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/skill-graph/evidence?id=${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Evidence removed");
    },
  });

  const ingest = useMutation({
    mutationFn: (body: { source: string; text?: string }) =>
      fetch("/api/skill-graph/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error("Ingest failed");
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success(`Extracted ${res.nodesCreated} skills and ${res.edgesCreated} connections`);
    },
    onError: () => toast.error("AI extraction failed"),
  });

  // Edit node state
  const [showEditNode, setShowEditNode] = useState(false);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeType, setEditNodeType] = useState("technical");

  // Scaffold state
  const [showScaffold, setShowScaffold] = useState(false);
  const [refreshOccupation, setRefreshOccupation] = useState("");
  const [refreshCluster, setRefreshCluster] = useState("");

  // Scaffold queries
  const { data: scaffoldInfo, isLoading: scaffoldLoading } = useQuery<ScaffoldData>({
    queryKey: ["scaffold-meta"],
    queryFn: () => fetch("/api/skill-graph/scaffold").then((r) => r.json()),
  });

  // Profile query for scaffold suggestion
  const { data: profileData } = useQuery<{ industryGroup?: string | null }>({
    queryKey: ["profile-industry"],
    queryFn: () => fetch("/api/profile").then((r) => r.json()),
    select: (d) => ({ industryGroup: d.industryGroup }),
  });

  const seedScaffold = useMutation({
    mutationFn: (cluster: string) =>
      fetch("/api/skill-graph/scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cluster }),
      }).then((r) => {
        if (!r.ok) throw new Error("Seed failed");
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["scaffold-meta"] });
      const occStr = res.occupationsSeeded ? ` + ${res.occupationsSeeded} occupations` : "";
      toast.success(`Seeded ${res.nodesSeeded} skills + ${res.edgesSeeded} connections${occStr} from "${res.cluster}"`);
    },
    onError: () => toast.error("Failed to seed scaffold"),
  });

  const removeScaffold = useMutation({
    mutationFn: (cluster: string) =>
      fetch(`/api/skill-graph/scaffold?cluster=${encodeURIComponent(cluster)}`, {
        method: "DELETE",
      }).then((r) => {
        if (!r.ok) throw new Error("Remove failed");
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["scaffold-meta"] });
      toast.success(`Removed ${res.removed} scaffold nodes from "${res.cluster}"`);
    },
    onError: () => toast.error("Failed to remove scaffold"),
  });

  const refreshScaffold = useMutation({
    mutationFn: (body: { occupation: string; cluster: string }) =>
      fetch("/api/skill-graph/scaffold/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error("Refresh failed");
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["scaffold-meta"] });
      toast.success(`AI refreshed: ${res.nodesCreated} skills, ${res.edgesCreated} connections for "${res.occupation}"`);
      setRefreshOccupation("");
      setRefreshCluster("");
    },
    onError: () => toast.error("AI refresh failed"),
  });

  // Auto-evidence mutation
  const autoEvidence = useMutation({
    mutationFn: () =>
      fetch("/api/skill-graph/auto-evidence", { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error ?? "Auto-evidence failed"); });
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success(
        `Linked ${res.evidenceCreated} evidence items across ${res.skillNodesMatched} skills (${res.skipped} skipped)`
      );
    },
    onError: (err: Error) => toast.error(err.message ?? "Auto-evidence failed"),
  });

  // Edit node mutation
  const editNode = useMutation({
    mutationFn: (body: { id: string; name: string; type: string }) =>
      fetch(`/api/skill-graph/${body.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: body.name, type: body.type }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to update node");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Skill node updated");
      setShowEditNode(false);
    },
    onError: () => toast.error("Failed to update skill node"),
  });

  // Build force-graph data
  const graphData = useCallback(() => {
    if (!data?.nodes) return { nodes: [], links: [] };

    const nodes: GraphNode[] = data.nodes.map((n) => {
      const evidenceItems = data.evidence.filter((e) => e.skillNodeId === n.id);
      const totalStrength = evidenceItems.reduce((s, e) => s + e.strength, 0);
      const avgStrength = evidenceItems.length > 0 ? totalStrength / evidenceItems.length : 0;

      // Don't show nodes based on layer toggle
      const isMarketNode = n.source === "market" || n.source === "ai";
      const hasEvidence = evidenceItems.length > 0;

      if (!showMarketView && isMarketNode && !hasEvidence) return null;
      if (!showEvidenceView && hasEvidence && !isMarketNode) return null;

      return {
        id: n.id,
        name: n.name,
        type: n.type,
        source: n.source,
        evidenceCount: evidenceItems.length,
        evidenceStrength: avgStrength,
        isOccupation: false,
        val: Math.max(3, 3 + evidenceItems.length * 2 + avgStrength / 20),
        color: hasEvidence
          ? `hsl(210, 100%, ${Math.max(30, 70 - avgStrength * 0.4)}%)`
          : NODE_TYPE_COLORS[n.type] ?? "#6b7280",
      };
    }).filter(Boolean) as GraphNode[];

    // Add occupation nodes
    if (showOccupationView && data.occupations) {
      for (const occ of data.occupations) {
        const interest = occ.interests?.[0];
        nodes.push({
          id: `occ-${occ.id}`,
          name: occ.title,
          type: "occupation",
          source: occ.source,
          evidenceCount: 0,
          evidenceStrength: 0,
          isOccupation: true,
          occupationStatus: interest?.status,
          val: 10,
          color: NODE_TYPE_COLORS.occupation,
        });
      }
    }

    const nodeIds = new Set(nodes.map((n) => n.id));

    const links: GraphLink[] = (data.edges ?? [])
      .filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId))
      .map((e) => ({
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: e.type,
        weight: e.weight,
        color: EDGE_TYPE_COLORS[e.type] ?? "#6b7280",
      }));

    // Add "requires" links from occupations to skills
    if (showOccupationView && data.occupations) {
      for (const occ of data.occupations) {
        const occNodeId = `occ-${occ.id}`;
        if (!nodeIds.has(occNodeId)) continue;
        for (const req of occ.requirements) {
          if (!nodeIds.has(req.skillNodeId)) continue;
          links.push({
            id: `req-${occ.id}-${req.skillNodeId}`,
            source: occNodeId,
            target: req.skillNodeId,
            type: "requires",
            weight: req.importance / 20, // scale 0-100 → 0-5
            color: EDGE_TYPE_COLORS.requires,
          });
        }
      }
    }

    return { nodes, links };
  }, [data, showMarketView, showEvidenceView, showOccupationView]);

  // Node click handler — show local graph (selected node + neighbors)
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node.id === selectedNode ? null : node.id);
    },
    [selectedNode]
  );

  // Selected node detail
  const selectedNodeData = data?.nodes.find((n) => n.id === selectedNode);
  const selectedOccupation = selectedNode?.startsWith("occ-")
    ? data?.occupations?.find((o) => `occ-${o.id}` === selectedNode)
    : null;
  const selectedNodeEdges = data?.edges.filter(
    (e) => e.fromId === selectedNode || e.toId === selectedNode
  );
  const selectedNodeEvidence = data?.evidence.filter(
    (e) => e.skillNodeId === selectedNode
  );

  // Graph dimensions — measure container via callback ref + ResizeObserver
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const observerRef = useRef<ResizeObserver | null>(null);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    containerElRef.current = el;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setDimensions((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
    };

    // Measure after layout settles (double-RAF ensures grid/flex is computed)
    requestAnimationFrame(() => requestAnimationFrame(measure));

    // Observe ongoing resizes
    const obs = new ResizeObserver(() => measure());
    obs.observe(el);
    observerRef.current = obs;
  }, []);

  // Zoom to fit when data loads or dimensions change
  useEffect(() => {
    if (graphRef.current && data && dimensions.width > 0) {
      // Increase charge repulsion so nodes spread to fill the space
      graphRef.current.d3Force("charge")?.strength(-120);
      graphRef.current.d3Force("center")?.x(dimensions.width / 2).y(dimensions.height / 2);
      graphRef.current.d3ReheatSimulation();
      // Zoom to fit after simulation settles
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 60);
      }, 500);
    }
  }, [data, dimensions.width, dimensions.height]);

  // Stats
  const totalNodes = data?.nodes.length ?? 0;
  const totalEdges = data?.edges.length ?? 0;
  const totalOccupations = data?.occupations?.length ?? 0;
  const provenNodes = data?.nodes.filter(
    (n) => (data?.evidence.filter((e) => e.skillNodeId === n.id).length ?? 0) > 0
  ).length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    );
  }

  const gd = graphData();

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Network className="h-5 w-5" />
            Skill Knowledge Graph
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalNodes} skills · {totalEdges} connections · {provenNodes} with evidence{totalOccupations > 0 ? ` · ${totalOccupations} occupations` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layer toggles */}
          <Button
            variant={showMarketView ? "default" : "outline"}
            size="sm"
            onClick={() => setShowMarketView(!showMarketView)}
          >
            {showMarketView ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Market
          </Button>
          <Button
            variant={showEvidenceView ? "default" : "outline"}
            size="sm"
            onClick={() => setShowEvidenceView(!showEvidenceView)}
          >
            {showEvidenceView ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Evidence
          </Button>
          <Button
            variant={showOccupationView ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOccupationView(!showOccupationView)}
            disabled={totalOccupations === 0}
          >
            {showOccupationView ? <Hexagon className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Occupations
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Actions */}
          <Button size="sm" variant="outline" onClick={() => setShowAddNode(true)}>
            <Plus className="h-4 w-4 mr-1" /> Skill
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddEdge(true)} disabled={totalNodes < 2}>
            <Link2 className="h-4 w-4 mr-1" /> Connect
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
              <Sparkles className="h-4 w-4 mr-1" />
              AI Extract
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => ingest.mutate({ source: "job_postings" })}
                disabled={ingest.isPending}
              >
                <Briefcase className="h-4 w-4 mr-2" />
                From Job Postings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => ingest.mutate({ source: "resume" })}
                disabled={ingest.isPending}
              >
                <FileText className="h-4 w-4 mr-2" />
                From Resume
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={() => setShowScaffold(true)}>
            <Globe className="h-4 w-4 mr-1" /> Seed Industry
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => autoEvidence.mutate()}
            disabled={autoEvidence.isPending || totalNodes === 0}
          >
            {autoEvidence.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ScanSearch className="h-4 w-4 mr-1" />
            )}
            Auto-Link Evidence
          </Button>
        </div>
      </div>

      {/* ── Graph + Detail Panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Graph Canvas */}
        <Card className="lg:col-span-3 !py-0">
          <CardContent className="p-0">
            <div ref={containerRef} className="w-full h-[calc(100vh-11rem)] min-h-[500px] relative">
              {gd.nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <Network className="h-12 w-12 opacity-30" />
                  {profileData?.industryGroup ? (
                    <>
                      <p className="text-sm text-center max-w-xs">
                        Your profile industry is <strong className="text-foreground">{profileData.industryGroup}</strong>.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => seedScaffold.mutate(profileData.industryGroup!)}
                        disabled={seedScaffold.isPending}
                      >
                        {seedScaffold.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-1" />
                        )}
                        Seed {profileData.industryGroup} Skills
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        or <button className="text-primary underline" onClick={() => setShowScaffold(true)}>browse all industries</button>
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-center max-w-xs">
                      No skills yet. <button className="text-primary underline" onClick={() => setShowScaffold(true)}>Seed an industry scaffold</button> or use AI Extract to scan your job postings.
                    </p>
                  )}
                </div>
              ) : (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={gd}
                  width={dimensions.width}
                  height={dimensions.height}
                  nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const n = node as GraphNode;
                    const ev = n.evidenceCount > 0 ? ` (${n.evidenceCount} evidence, ${Math.round(n.evidenceStrength)}% strength)` : "";
                    return `${n.name} [${n.type}]${ev}`;
                  }}
                  nodeColor={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const n = node as GraphNode;
                    if (n.id === selectedNode) return "#ffffff";
                    if (n.id === hoveredNode) return "#e2e8f0";
                    return n.color;
                  }}
                  nodeVal={(node: any) => (node as GraphNode).val} // eslint-disable-line @typescript-eslint/no-explicit-any
                  nodeCanvasObject={(node: any, ctx, globalScale) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const n = node as GraphNode;
                    const label = n.name;
                    const fontSize = Math.max(10, 12 / globalScale);
                    ctx.font = `${fontSize}px Sans-Serif`;

                    const radius = Math.max(4, n.val);
                    const x = n.x ?? 0;
                    const y = n.y ?? 0;

                    if (n.isOccupation) {
                      // Draw hexagon for occupation nodes
                      ctx.beginPath();
                      for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i - Math.PI / 6;
                        const hx = x + radius * 1.3 * Math.cos(angle);
                        const hy = y + radius * 1.3 * Math.sin(angle);
                        if (i === 0) ctx.moveTo(hx, hy);
                        else ctx.lineTo(hx, hy);
                      }
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#e11d48" : NODE_TYPE_COLORS.occupation;
                      ctx.fill();
                      ctx.strokeStyle = "rgba(255,255,255,0.6)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                    } else {
                      // Draw circle for skill nodes
                      ctx.beginPath();
                      ctx.arc(x, y, radius, 0, 2 * Math.PI);

                      // Glow effect for evidence nodes
                      if (n.evidenceCount > 0) {
                        ctx.shadowColor = n.color;
                        ctx.shadowBlur = 8 + n.evidenceStrength / 10;
                      }

                      ctx.fillStyle = n.id === selectedNode ? "#3b82f6" : n.color;
                      ctx.fill();
                      ctx.shadowBlur = 0;

                      // Selected ring
                      if (n.id === selectedNode) {
                        ctx.strokeStyle = "#ffffff";
                        ctx.lineWidth = 2 / globalScale;
                        ctx.stroke();
                      }
                    }

                    // Label
                    if (globalScale > 0.6 || n.id === selectedNode || n.id === hoveredNode || n.isOccupation) {
                      ctx.fillStyle = "rgba(255,255,255,0.9)";
                      ctx.textAlign = "center";
                      ctx.textBaseline = "top";
                      ctx.fillText(label, x, y + radius + 2);
                    }
                  }}
                  linkColor={(link: any) => (link as GraphLink).color} // eslint-disable-line @typescript-eslint/no-explicit-any
                  linkWidth={(link: any) => Math.max(0.5, (link as GraphLink).weight / 3)} // eslint-disable-line @typescript-eslint/no-explicit-any
                  linkDirectionalArrowLength={(link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const l = link as GraphLink;
                    return l.type === "prerequisite" || l.type === "enables" || l.type === "requires" ? 4 : 0;
                  }}
                  linkDirectionalArrowRelPos={0.9}
                  linkLineDash={(link: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const l = link as GraphLink;
                    return l.type === "requires" ? [4, 2] : null;
                  }}
                  onNodeClick={(node: any) => handleNodeClick(node as GraphNode)} // eslint-disable-line @typescript-eslint/no-explicit-any
                  onNodeHover={(node: any) => setHoveredNode(node?.id ?? null)} // eslint-disable-line @typescript-eslint/no-explicit-any
                  cooldownTicks={100}
                  backgroundColor="transparent"
                />
              )}

              {ingest.isPending && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Extracting skills with AI...
                  </div>
                </div>
              )}

              {autoEvidence.isPending && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Scanning your career data for evidence links...
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card className="lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedNodeData ? selectedNodeData.name : "Node Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedOccupation ? (
              <>
                {/* Occupation detail panel */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                    <Hexagon className="h-3 w-3 mr-1" /> Occupation
                  </Badge>
                  <Badge variant="secondary">{selectedOccupation.socCode}</Badge>
                  {selectedOccupation.interests?.[0]?.status && (
                    <Badge variant="outline" className="capitalize">
                      {selectedOccupation.interests[0].status}
                    </Badge>
                  )}
                </div>

                {selectedOccupation.description && (
                  <p className="text-xs text-muted-foreground">{selectedOccupation.description}</p>
                )}

                {/* Required skills */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Required Skills ({selectedOccupation.requirements.length})
                  </h4>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {selectedOccupation.requirements
                      .sort((a, b) => b.importance - a.importance)
                      .map((req) => {
                        const skillNode = data?.nodes.find((n) => n.id === req.skillNodeId);
                        const evidenceItems = data?.evidence.filter((e) => e.skillNodeId === req.skillNodeId) ?? [];
                        const maxStrength = evidenceItems.length > 0
                          ? Math.max(...evidenceItems.map((e) => e.strength))
                          : 0;
                        return (
                          <div key={req.skillNodeId} className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="truncate">{skillNode?.name ?? "Unknown"}</span>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                {Math.round(req.importance)}% imp.
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${maxStrength >= 50 ? "bg-green-500" : maxStrength > 0 ? "bg-amber-500" : "bg-red-500/40"}`}
                                style={{ width: `${maxStrength}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Status selector */}
                <div className="pt-2 border-t">
                  <Label className="text-xs">Track as</Label>
                  <Select
                    value={selectedOccupation.interests?.[0]?.status ?? ""}
                    onValueChange={(v) => {
                      if (!v) return;
                      fetch(`/api/skill-graph/occupations/${selectedOccupation.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: v }),
                      }).then(() => {
                        qc.invalidateQueries({ queryKey: ["skill-graph"] });
                        toast.success(`Tracking as ${v}`);
                      });
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Set status..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current Role</SelectItem>
                      <SelectItem value="target">Target Role</SelectItem>
                      <SelectItem value="exploring">Exploring</SelectItem>
                      <SelectItem value="past">Past Role</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : selectedNodeData ? (
              <>
                {/* Node info */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="capitalize">
                    {selectedNodeData.type}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">
                    {selectedNodeData.source}
                  </Badge>
                </div>

                {/* Connections */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Connections ({selectedNodeEdges?.length ?? 0})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedNodeEdges?.map((edge) => {
                      const otherId = edge.fromId === selectedNode ? edge.toId : edge.fromId;
                      const otherNode = data?.nodes.find((n) => n.id === otherId);
                      const dir = edge.fromId === selectedNode ? "→" : "←";
                      return (
                        <div key={edge.id} className="flex items-center justify-between text-sm group">
                          <span className="truncate">
                            {dir} {otherNode?.name ?? "Unknown"}
                            <span className="text-muted-foreground ml-1">
                              ({EDGE_TYPE_LABELS[edge.type] ?? edge.type})
                            </span>
                          </span>
                          <button
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteEdge.mutate(edge.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {(selectedNodeEdges?.length ?? 0) === 0 && (
                      <p className="text-sm text-muted-foreground">No connections yet</p>
                    )}
                  </div>
                </div>

                {/* Evidence (Layer 2) */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Evidence ({selectedNodeEvidence?.length ?? 0})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedNodeEvidence?.map((ev) => {
                      const evType = EVIDENCE_TYPES.find((t) => t.value === ev.artifactType);
                      const Icon = evType?.icon ?? FileText;
                      return (
                        <div key={ev.id} className="flex items-center justify-between text-sm group">
                          <span className="flex items-center gap-1.5 truncate">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {evType?.label ?? ev.artifactType}
                            <span className="text-muted-foreground">({ev.strength}%)</span>
                          </span>
                          <button
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteEvidence.mutate(ev.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {(selectedNodeEvidence?.length ?? 0) === 0 && (
                      <p className="text-sm text-muted-foreground">No evidence attached</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditNodeName(selectedNodeData!.name);
                      setEditNodeType(selectedNodeData!.type);
                      setShowEditNode(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEvidenceNodeId(selectedNode!);
                      setShowAddEvidence(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Evidence
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEdgeFrom(selectedNode!);
                      setShowAddEdge(true);
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Connect
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteNode.mutate(selectedNode!)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground space-y-3">
                <p>Click a node in the graph to view details, connections, and evidence.</p>
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Legend</h4>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(NODE_TYPE_COLORS).map(([type, color]) => (
                      <div key={type} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="capitalize">{type}</span>
                      </div>
                    ))}
                  </div>
                  <h4 className="font-medium text-foreground mt-3">Edge Types</h4>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(EDGE_TYPE_COLORS).map(([type, color]) => (
                      <div key={type} className="flex items-center gap-1.5">
                        <span className="w-4 h-0.5" style={{ backgroundColor: color }} />
                        <span className="capitalize">{EDGE_TYPE_LABELS[type]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Add Node Dialog ── */}
      <Dialog open={showAddNode} onOpenChange={setShowAddNode}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Skill Node</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newNodeName.trim()) return;
              addNode.mutate({ name: newNodeName.trim(), type: newNodeType });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Skill Name</Label>
              <Input
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder="e.g., PLC Programming"
                autoFocus
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newNodeType} onValueChange={(v) => setNewNodeType(v ?? "technical")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addNode.isPending || !newNodeName.trim()} className="w-full">
              {addNode.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Skill
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Edge Dialog ── */}
      <Dialog open={showAddEdge} onOpenChange={setShowAddEdge}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Skills</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
              addEdge.mutate({ fromId: edgeFrom, toId: edgeTo, type: edgeType });
            }}
            className="space-y-4"
          >
            <div>
              <Label>From Skill</Label>
              <Select value={edgeFrom} onValueChange={(v) => setEdgeFrom(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select skill..." />
                </SelectTrigger>
                <SelectContent>
                  {data?.nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <Label>To Skill</Label>
              <Select value={edgeTo} onValueChange={(v) => setEdgeTo(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select skill..." />
                </SelectTrigger>
                <SelectContent>
                  {data?.nodes
                    .filter((n) => n.id !== edgeFrom)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Relationship Type</Label>
              <Select value={edgeType} onValueChange={(v) => setEdgeType(v ?? "peer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {EDGE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="submit"
              disabled={addEdge.isPending || !edgeFrom || !edgeTo || edgeFrom === edgeTo}
              className="w-full"
            >
              {addEdge.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Connect
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Evidence Dialog ── */}
      <Dialog open={showAddEvidence} onOpenChange={setShowAddEvidence}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add Evidence — {data?.nodes.find((n) => n.id === evidenceNodeId)?.name}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!evidenceNodeId) return;
              addEvidence.mutate({
                skillNodeId: evidenceNodeId,
                artifactType: evidenceType,
                strength: evidenceStrength,
                notes: evidenceNotes,
              });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Evidence Type</Label>
              <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v ?? "self_assessed")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Strength ({evidenceStrength}%)</Label>
              <input
                type="range"
                min={0}
                max={100}
                value={evidenceStrength}
                onChange={(e) => setEvidenceStrength(Number(e.target.value))}
                className="w-full mt-1"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Theoretical</span>
                <span>Expert</span>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                placeholder="e.g., 3 years at Siemens programming S7 PLCs..."
                rows={3}
              />
            </div>
            <Button type="submit" disabled={addEvidence.isPending} className="w-full">
              {addEvidence.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Evidence
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Node Dialog ── */}
      <Dialog open={showEditNode} onOpenChange={setShowEditNode}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Skill Node</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editNodeName.trim() || !selectedNode) return;
              editNode.mutate({ id: selectedNode, name: editNodeName.trim(), type: editNodeType });
            }}
            className="space-y-4"
          >
            <div>
              <Label>Skill Name</Label>
              <Input
                value={editNodeName}
                onChange={(e) => setEditNodeName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={editNodeType} onValueChange={(v) => setEditNodeType(v ?? "technical")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NODE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={editNode.isPending || !editNodeName.trim()} className="w-full">
              {editNode.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Pencil className="h-4 w-4 mr-1" />}
              Update Skill
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Scaffold Seed Dialog ── */}
      <Dialog open={showScaffold} onOpenChange={setShowScaffold}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Seed Industry Scaffold
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pre-populate your skill graph with market-standard skills for an industry.
            These scaffold nodes evolve — refresh anytime with AI to stay current.
          </p>

          {scaffoldLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              {scaffoldInfo?.clusters.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{c.name}</span>
                      {c.seeded && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          <Check className="h-3 w-3 mr-0.5" /> Seeded
                        </Badge>
                      )}
                      {c.needsRefresh && (
                        <Badge variant="outline" className="text-xs text-amber-500 border-amber-500 shrink-0">
                          Update available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5"> · {c.occupationCount ?? 0} occupations
                      SOC {c.socPrefix}xx · {c.nodeCount} skills · {c.edgeCount} connections
                      {c.seededAt && ` · Seeded ${new Date(c.seededAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {c.seeded ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => seedScaffold.mutate(c.name)}
                          disabled={seedScaffold.isPending || removeScaffold.isPending}
                          title="Re-seed / refresh from static data"
                        >
                          {seedScaffold.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeScaffold.mutate(c.name)}
                          disabled={removeScaffold.isPending || seedScaffold.isPending}
                          title="Remove scaffold nodes"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => seedScaffold.mutate(c.name)}
                        disabled={seedScaffold.isPending}
                      >
                        {seedScaffold.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        Seed
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Refresh Section */}
          <div className="border-t pt-4 mt-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Sparkles className="h-4 w-4" />
              AI-Powered Refresh
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Generate a fresh, market-aware skill cluster tailored to a specific occupation using AI.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Target Occupation</Label>
                <Input
                  value={refreshOccupation}
                  onChange={(e) => setRefreshOccupation(e.target.value)}
                  placeholder="e.g., Full Stack Developer, Data Scientist..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Industry Cluster</Label>
                <Select value={refreshCluster} onValueChange={(v) => setRefreshCluster(v ?? "")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select cluster..." />
                  </SelectTrigger>
                  <SelectContent>
                    {scaffoldInfo?.clusters.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={refreshScaffold.isPending || !refreshOccupation.trim() || !refreshCluster}
                onClick={() =>
                  refreshScaffold.mutate({
                    occupation: refreshOccupation.trim(),
                    cluster: refreshCluster,
                  })
                }
              >
                {refreshScaffold.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Generating with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Generate Fresh Scaffold
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

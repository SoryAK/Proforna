"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  Search,
  Star,
  Download,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  BarChart3,
  User,
  Layers,
  Flame,
  ArrowUpRight,
  Calendar,
  Building2,
  Focus,
  GraduationCap,
} from "lucide-react";
import SkillGraphAnalytics from "@/components/skill-graph-analytics";
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

interface CareerEventEntry {
  id: string;
  workHistoryId: string | null;
  title: string;
  description: string | null;
  category: string;
  startDate: string | null;
  endDate: string | null;
  metrics: string | null;
  skills: { skillNodeId: string }[];
}

interface GraphData {
  nodes: SkillNode[];
  edges: SkillEdge[];
  evidence: SkillEvidence[];
  occupations: OccupationData[];
  workHistories: WorkHistoryEntry[];
  careerEvents: CareerEventEntry[];
}

interface WorkHistoryEntry {
  id: string;
  title: string | null;
  company: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  degree?: string | null;
  major?: string | null;
}

interface RoleGroup {
  key: string;        // normalized title (lowercase)
  title: string;      // display title (first occurrence's casing)
  instances: WorkHistoryEntry[];
  matchingOccupationId?: string; // real occupation DB id (not occ- prefixed)
}

interface OccupationData {
  id: string;
  socCode: string;
  title: string;
  description: string | null;
  cluster: string;
  source: string;
  metadata: string | null;
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
  company?: string; // company grouping for visual hulls
  // Role instance topology fields
  isRoleGroup?: boolean;
  isRoleInstance?: boolean;
  isEducation?: boolean;
  isCareerEvent?: boolean;
  careerEventId?: string;
  roleGroupKey?: string;   // for instances: which group they belong to
  instanceCount?: number;  // for groups: how many instances
  workHistoryId?: string;  // for instances: the work history ID
  startDate?: string;
  endDate?: string;
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
  contains: "Contains",
  maps_to: "Maps to",
};

const COMPANY_HULL_COLORS = [
  "rgba(59,130,246,0.08)",   // blue
  "rgba(139,92,246,0.08)",   // purple
  "rgba(245,158,11,0.08)",   // amber
  "rgba(16,185,129,0.08)",   // green
  "rgba(244,63,94,0.08)",    // rose
  "rgba(14,165,233,0.08)",   // sky
  "rgba(168,85,247,0.08)",   // violet
  "rgba(234,179,8,0.08)",    // yellow
];

const COMPANY_BORDER_COLORS = [
  "rgba(59,130,246,0.35)",
  "rgba(139,92,246,0.35)",
  "rgba(245,158,11,0.35)",
  "rgba(16,185,129,0.35)",
  "rgba(244,63,94,0.35)",
  "rgba(14,165,233,0.35)",
  "rgba(168,85,247,0.35)",
  "rgba(234,179,8,0.35)",
];

const NODE_TYPES = ["technical", "domain", "tool", "soft"] as const;
const EDGE_TYPES = ["prerequisite", "peer", "bridge", "child", "enables"] as const;

// ── EDM zone colors for splat view ──
const EDM_ZONE_COLORS: Record<string, string> = {
  CORE: "#f59e0b",  // amber — direct daily use
  NEAR: "#3b82f6",  // blue — adjacent/observed
  MID:  "#8b5cf6",  // purple — interacted with
  FAR:  "#6b7280",  // gray — ambient/osmosis
};
const EDM_ZONE_LABELS: Record<string, string> = {
  CORE: "Core — Direct daily use",
  NEAR: "Near — Observed / adjacent",
  MID:  "Mid — Interacted with",
  FAR:  "Far — Ambient knowledge",
};

// EDM field entry type from the API
interface EDMFieldEntry {
  nodeId: string;
  nodeName: string;
  nodeType?: string;
  accumulatedIntensity: number;
  sourceCount: number;
  zones: string[];
  categories: string[];
  transferable: boolean;
}

interface EDMSplatEntry {
  nodeId: string;
  nodeName: string;
  nodeType?: string;
  intensity: number;
  zone: string;
  category: string;
}

interface EDMSplatSource {
  workHistoryId: string;
  label: string;
}

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
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // EDM state
  const [showDiffusion, setShowDiffusion] = useState(false); // toggle EDM intensity view
  const [showTransferable, setShowTransferable] = useState(false); // highlight transferable skills
  const [edmSplatSource, setEdmSplatSource] = useState<string | null>(null); // workHistoryId for splat view

  // Role Instance Topology state
  const [showRoleInstances, setShowRoleInstances] = useState(true); // toggle role instance layer
  const [expandedRoleGroups, setExpandedRoleGroups] = useState<Set<string>>(new Set());
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set()); // instance IDs with visible events

  // Focus mode state — drill into a node's neighborhood
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusBreadcrumb, setFocusBreadcrumb] = useState<{ id: string; label: string }[]>([]);

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

  const deleteOccupation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/skill-graph/occupations/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok) throw new Error("Failed to delete");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success("Occupation removed");
      setSelectedNode(null);
    },
    onError: () => toast.error("Failed to remove occupation"),
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

  const syncProfile = useMutation({
    mutationFn: () =>
      fetch("/api/skill-graph/sync-profile", { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((b) => { throw new Error(b.error || "Sync failed"); });
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      // Auto-enable Roles toggle after sync so role topology is visible
      setShowRoleInstances(true);
      const newParts = [];
      if (res.nodesNew) newParts.push(`${res.nodesNew} skills`);
      if (res.occupationsNew) newParts.push(`${res.occupationsNew} occupations`);
      if (res.edgesNew) newParts.push(`${res.edgesNew} connections`);
      if (res.occSkillLinksNew) newParts.push(`${res.occSkillLinksNew} occ→skill links`);
      if (res.evidenceNew) newParts.push(`${res.evidenceNew} evidence`);

      const existingTotal = (res.nodesExisted ?? 0) + (res.occupationsExisted ?? 0) + (res.edgesExisted ?? 0) + (res.evidenceExisted ?? 0);
      const existingNote = existingTotal > 0 ? ` (${existingTotal} already existed)` : "";

      if (newParts.length > 0) {
        toast.success(`Synced ${newParts.join(", ")}${existingNote}`);
      } else if (existingTotal > 0) {
        toast.info(`Everything already synced (${existingTotal} items up to date)`);
      } else {
        toast.info("No new data found to sync");
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Profile sync failed"),
  });

  // ── EDM (Experience Diffusion Model) ──────────────────────────
  const { data: edmData } = useQuery<{ field: EDMFieldEntry[]; totalSources: number; transferableCount: number }>({
    queryKey: ["edm-field"],
    queryFn: () => fetch("/api/skill-graph/edm").then((r) => r.json()),
    enabled: showDiffusion || showTransferable,
  });

  const generateEDM = useMutation({
    mutationFn: () =>
      fetch("/api/skill-graph/edm", { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((b) => { throw new Error(b.error || "EDM generation failed"); });
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["edm-field"] });
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      const msg = `Diffusion map: ${res.nodesCreated} new nodes, ${res.exposuresCreated} exposures across ${res.totalSources} roles`;
      if (res.transferableCount > 0) {
        toast.success(`${msg} — ${res.transferableCount} transferable skills found!`);
      } else {
        toast.success(msg);
      }
      setShowDiffusion(true);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "EDM generation failed"),
  });

  // Build EDM lookup maps for fast access in rendering
  const edmByNodeId = useMemo(() => {
    const map = new Map<string, EDMFieldEntry>();
    if (edmData?.field) {
      for (const entry of edmData.field) map.set(entry.nodeId, entry);
    }
    return map;
  }, [edmData?.field]);

  // Splat sources — available work histories that have diffusion data
  const { data: splatSources } = useQuery<{ sources: EDMSplatSource[] }>({
    queryKey: ["edm-splat-sources"],
    queryFn: () => fetch("/api/skill-graph/edm?sources=1").then((r) => r.json()),
    enabled: showDiffusion,
  });

  // Per-role splat data — when a specific role is selected
  const { data: splatData } = useQuery<{ field: EDMSplatEntry[]; workHistoryId: string }>({
    queryKey: ["edm-splat", edmSplatSource],
    queryFn: () => fetch(`/api/skill-graph/edm?workHistoryId=${edmSplatSource}`).then((r) => r.json()),
    enabled: !!edmSplatSource,
  });

  // Per-role splat lookup: nodeId → zone color
  const splatByNodeId = useMemo(() => {
    const map = new Map<string, EDMSplatEntry>();
    if (splatData?.field) {
      for (const entry of splatData.field) map.set(entry.nodeId, entry);
    }
    return map;
  }, [splatData?.field]);

  // ── Role Instance Topology: group work histories by title ──
  // Schools are excluded — they get their own education nodes
  const roleGroups = useMemo<RoleGroup[]>(() => {
    const whs = data?.workHistories?.filter((w) => w.type !== "school");
    if (!whs?.length) return [];

    // Tier 2: normalize title for fuzzy grouping
    const normalize = (t: string) =>
      t.toLowerCase()
        .replace(/\b(sr\.?|senior|jr\.?|junior|lead|principal|staff|chief|head)\b/gi, "")
        .replace(/\b(i{1,3}|iv|v|1|2|3|4|5)\b/gi, "") // roman numerals / levels
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Token overlap: returns fraction of shared tokens (Jaccard)
    const tokenOverlap = (a: string, b: string) => {
      const ta = new Set(a.split(" ").filter(Boolean));
      const tb = new Set(b.split(" ").filter(Boolean));
      if (ta.size === 0 || tb.size === 0) return 0;
      let inter = 0;
      for (const t of ta) if (tb.has(t)) inter++;
      return inter / Math.max(ta.size, tb.size);
    };

    const groupMap = new Map<string, RoleGroup>();

    // Find or create a group for a given title, using fuzzy matching
    const findGroup = (rawTitle: string): string => {
      const norm = normalize(rawTitle);
      // Exact normalized match
      if (groupMap.has(norm)) return norm;
      // Token overlap match (≥ 0.7)
      for (const [key] of groupMap) {
        if (tokenOverlap(norm, key) >= 0.7) return key;
      }
      return norm;
    };

    for (const wh of whs) {
      const rawTitle = wh.title?.trim() || wh.company;
      const key = findGroup(rawTitle);
      if (!groupMap.has(key)) {
        // Try to match to an existing occupation by title (case-insensitive)
        const matchOcc = data?.occupations?.find(
          (o) => o.title.toLowerCase() === rawTitle.toLowerCase()
            || normalize(o.title) === key
        );
        groupMap.set(key, {
          key,
          title: rawTitle,
          instances: [],
          matchingOccupationId: matchOcc?.id,
        });
      }
      groupMap.get(key)!.instances.push(wh);
    }
    // Sort groups by earliest start date
    return Array.from(groupMap.values()).sort((a, b) => {
      const aDate = a.instances.at(-1)?.startDate ?? "";
      const bDate = b.instances.at(-1)?.startDate ?? "";
      return bDate.localeCompare(aDate);
    });
  }, [data?.workHistories, data?.occupations]);

  // Lookup: workHistoryId → RoleGroup for quick access
  const whToRoleGroup = useMemo(() => {
    const map = new Map<string, RoleGroup>();
    for (const g of roleGroups) {
      for (const inst of g.instances) map.set(inst.id, g);
    }
    return map;
  }, [roleGroups]);

  // Education entries (type === "school") — separate from roles
  const educationEntries = useMemo(() => {
    return data?.workHistories?.filter((w) => w.type === "school") ?? [];
  }, [data?.workHistories]);

  // Edit node state
  const [showEditNode, setShowEditNode] = useState(false);
  const [editNodeName, setEditNodeName] = useState("");
  const [editNodeType, setEditNodeType] = useState("technical");

  // O*NET search state
  const [showOnetSearch, setShowOnetSearch] = useState(false);
  const [onetQuery, setOnetQuery] = useState("");
  const [onetResults, setOnetResults] = useState<{ code: string; title: string; brightOutlook: boolean }[]>([]);
  const [onetSearching, setOnetSearching] = useState(false);
  const [onetPreview, setOnetPreview] = useState<string | null>(null);
  const [onetPreviewData, setOnetPreviewData] = useState<any>(null);
  const [onetPreviewLoading, setOnetPreviewLoading] = useState(false);
  const [onetImporting, setOnetImporting] = useState<string | null>(null);

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

  // Clear entire graph
  const clearGraph = useMutation({
    mutationFn: () =>
      fetch("/api/skill-graph", { method: "DELETE" }).then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.error ?? "Clear failed"); });
        return r.json();
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      qc.invalidateQueries({ queryKey: ["edm-field"] });
      qc.invalidateQueries({ queryKey: ["edm-splat-sources"] });
      setSelectedNode(null);
      setEdmSplatSource(null);
      setShowDiffusion(false);
      setShowTransferable(false);
      setShowRoleInstances(false);
      setExpandedRoleGroups(new Set());
      setFocusNodeId(null);
      setFocusBreadcrumb([]);
      const c = res.cleared;
      toast.success(`Cleared ${c.nodes} nodes, ${c.edges} edges, ${c.occupations} occupations, ${c.exposures} exposures`);
    },
    onError: (err: Error) => toast.error(err.message ?? "Clear failed"),
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

  // O*NET search helpers
  const onetSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOnetSearch = useCallback((keyword: string) => {
    setOnetQuery(keyword);
    setOnetPreview(null);
    setOnetPreviewData(null);
    if (onetSearchTimeout.current) clearTimeout(onetSearchTimeout.current);
    if (!keyword.trim()) {
      setOnetResults([]);
      setOnetSearching(false);
      return;
    }
    setOnetSearching(true);
    onetSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onet/search?keyword=${encodeURIComponent(keyword.trim())}&limit=20`);
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setOnetResults(data.occupations ?? []);
      } catch {
        toast.error("O*NET search failed");
        setOnetResults([]);
      } finally {
        setOnetSearching(false);
      }
    }, 350);
  }, []);

  const handleOnetPreview = useCallback(async (code: string) => {
    if (onetPreview === code) {
      setOnetPreview(null);
      setOnetPreviewData(null);
      return;
    }
    setOnetPreview(code);
    setOnetPreviewLoading(true);
    setOnetPreviewData(null);
    try {
      const res = await fetch(`/api/onet/occupation/${code}`);
      if (!res.ok) throw new Error("Failed to fetch details");
      setOnetPreviewData(await res.json());
    } catch {
      toast.error("Failed to load occupation details");
      setOnetPreview(null);
    } finally {
      setOnetPreviewLoading(false);
    }
  }, [onetPreview]);

  const handleOnetImport = useCallback(async (code: string) => {
    setOnetImporting(code);
    try {
      const res = await fetch("/api/onet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Import failed");
      }
      const result = await res.json();
      qc.invalidateQueries({ queryKey: ["skill-graph"] });
      toast.success(
        `Imported "${result.occupation.title}" with ${result.requirementsLinked} skills (${result.skillsCreated} new)`
      );
    } catch (err: any) {
      toast.error(err.message ?? "O*NET import failed");
    } finally {
      setOnetImporting(null);
    }
  }, [qc]);

  // Track previous node positions to prevent simulation reheat on expand/collapse
  const prevNodePositions = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());

  // Build force-graph data
  const gd = useMemo(() => {
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

      // EDM intensity scaling
      const edmEntry = edmByNodeId.get(n.id);
      const edmIntensity = edmEntry?.accumulatedIntensity ?? 0;
      const isTransferable = edmEntry?.transferable ?? false;
      const splatEntry = splatByNodeId.get(n.id);

      // Node size: base + evidence + EDM intensity boost
      let nodeVal = Math.max(3, 3 + evidenceItems.length * 2 + avgStrength / 20);
      if (edmSplatSource && splatEntry) {
        nodeVal = Math.max(4, 4 + splatEntry.intensity * 14); // 4–18 range per zone
      } else if (showDiffusion && edmIntensity > 0) {
        nodeVal = Math.max(4, 4 + edmIntensity * 12); // 4–16 range based on intensity
      }

      // Node color: splat view > EDM accumulated > transferable > normal
      let nodeColor: string;
      if (edmSplatSource && splatEntry) {
        nodeColor = EDM_ZONE_COLORS[splatEntry.zone as keyof typeof EDM_ZONE_COLORS] ?? "#6b7280";
      } else if (edmSplatSource) {
        // Node not in this role's splat — dim it
        nodeColor = "#374151";
      } else if (showDiffusion && edmIntensity > 0) {
        // Warm gradient: low intensity = cool blue, high = bright amber
        const hue = 30 + (1 - edmIntensity) * 180; // 30 (amber) to 210 (blue)
        const lightness = Math.max(35, 65 - edmIntensity * 30);
        nodeColor = `hsl(${hue}, 90%, ${lightness}%)`;
      } else if (showTransferable && isTransferable) {
        nodeColor = "#f59e0b"; // amber for transferable
      } else if (hasEvidence) {
        nodeColor = `hsl(210, 100%, ${Math.max(30, 70 - avgStrength * 0.4)}%)`;
      } else {
        nodeColor = NODE_TYPE_COLORS[n.type] ?? "#6b7280";
      }

      return {
        id: n.id,
        name: n.name,
        type: n.type,
        source: n.source,
        evidenceCount: evidenceItems.length,
        evidenceStrength: avgStrength,
        isOccupation: false,
        val: nodeVal,
        color: nodeColor,
      };
    }).filter(Boolean) as GraphNode[];

    // Build a set of occupation IDs that have matching role groups
    const occIdsWithRoles = new Set<string>();
    // Map roleGroupKey → the parent node ID that owns it (for position seeding)
    const roleGroupParentNodeId = new Map<string, string>();
    if (showRoleInstances) {
      for (const group of roleGroups) {
        if (group.matchingOccupationId) occIdsWithRoles.add(group.matchingOccupationId);
      }
    }

    // Add occupation nodes (with company parsed from metadata)
    // If a role group matches, mark the occupation as expandable
    if (showOccupationView && data.occupations) {
      for (const occ of data.occupations) {
        const interest = occ.interests?.[0];
        let company: string | undefined;
        try {
          const meta = occ.metadata ? JSON.parse(occ.metadata) : null;
          if (meta?.company) company = meta.company;
        } catch { /* ignore */ }
        const matchedGroup = showRoleInstances
          ? roleGroups.find((g) => g.matchingOccupationId === occ.id)
          : undefined;
        nodes.push({
          id: `occ-${occ.id}`,
          name: occ.title,
          type: "occupation",
          source: occ.source,
          evidenceCount: 0,
          evidenceStrength: 0,
          isOccupation: true,
          isRoleGroup: !!matchedGroup,
          instanceCount: matchedGroup?.instances.length,
          roleGroupKey: matchedGroup?.key,
          occupationStatus: interest?.status,
          company,
          val: matchedGroup ? 10 + matchedGroup.instances.length * 2 : 10,
          color: NODE_TYPE_COLORS.occupation,
        });
        if (matchedGroup) roleGroupParentNodeId.set(matchedGroup.key, `occ-${occ.id}`);
        // If expanded, add instance children
        if (matchedGroup && expandedRoleGroups.has(matchedGroup.key)) {
          for (const inst of matchedGroup.instances) {
            const label = `${inst.company}${inst.startDate ? ` (${inst.startDate}${inst.endDate ? `–${inst.endDate}` : "–now"})` : ""}`;
            nodes.push({
              id: `ri-${inst.id}`,
              name: label,
              type: "role-instance",
              source: "work_history",
              evidenceCount: 0,
              evidenceStrength: 0,
              isOccupation: false,
              isRoleInstance: true,
              roleGroupKey: matchedGroup.key,
              workHistoryId: inst.id,
              company: inst.company,
              startDate: inst.startDate ?? undefined,
              endDate: inst.endDate ?? undefined,
              val: 7,
              color: "#38bdf8",
            });
          }
        }
      }
    }

    // ── Role Instance Topology (standalone groups — no matching occupation) ──
    if (showRoleInstances && roleGroups.length > 0) {
      for (const group of roleGroups) {
        // Skip groups already merged into an occupation node
        if (group.matchingOccupationId && occIdsWithRoles.has(group.matchingOccupationId)) continue;
        const isExpanded = expandedRoleGroups.has(group.key);

        // Always show the group header (title only, no company)
        nodes.push({
          id: `rg-${group.key}`,
          name: group.title,
          type: "role-group",
          source: "work_history",
          evidenceCount: 0,
          evidenceStrength: 0,
          isOccupation: false,
          isRoleGroup: true,
          instanceCount: group.instances.length,
          val: 8 + group.instances.length * 2,
          color: "#0ea5e9",
        });
        roleGroupParentNodeId.set(group.key, `rg-${group.key}`);

        // When expanded: show individual instance nodes
        if (isExpanded) {
          for (const inst of group.instances) {
            const label = `${inst.company}${inst.startDate ? ` (${inst.startDate}${inst.endDate ? `–${inst.endDate}` : "–now"})` : ""}`;
            nodes.push({
              id: `ri-${inst.id}`,
              name: label,
              type: "role-instance",
              source: "work_history",
              evidenceCount: 0,
              evidenceStrength: 0,
              isOccupation: false,
              isRoleInstance: true,
              roleGroupKey: group.key,
              workHistoryId: inst.id,
              company: inst.company,
              startDate: inst.startDate ?? undefined,
              endDate: inst.endDate ?? undefined,
              val: 7,
              color: "#38bdf8",
            });
          }
        }
      }
    }

    // ── Education nodes (type === "school") ──
    if (showRoleInstances) {
      for (const edu of educationEntries) {
        const eduId = `edu-${edu.id}`;
        const label = edu.company || edu.title || "School";
        nodes.push({
          id: eduId,
          name: label,
          type: "education",
          source: "work_history",
          evidenceCount: 0,
          evidenceStrength: 0,
          isOccupation: false,
          isEducation: true,
          workHistoryId: edu.id,
          company: edu.company,
          startDate: edu.startDate ?? undefined,
          endDate: edu.endDate ?? undefined,
          val: 12,
          color: "#a78bfa", // violet
        });
      }
    }

    // ── Career Event nodes (expand from role instances) ──
    if (showRoleInstances && data.careerEvents?.length > 0) {
      for (const evt of data.careerEvents) {
        const instanceId = `ri-${evt.workHistoryId}`;
        // Only show events for expanded instances
        if (!expandedInstances.has(evt.workHistoryId)) continue;
        // Make sure the parent instance node actually exists in the graph
        if (!nodes.some((n) => n.id === instanceId)) continue;
        nodes.push({
          id: `evt-${evt.id}`,
          name: evt.title,
          type: "career-event",
          source: "career_event",
          evidenceCount: evt.skills.length,
          evidenceStrength: 0,
          isOccupation: false,
          isCareerEvent: true,
          careerEventId: evt.id,
          workHistoryId: evt.workHistoryId,
          startDate: evt.startDate ?? undefined,
          endDate: evt.endDate ?? undefined,
          val: 5,
          color: "#f59e0b", // amber
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

    // ── Role Instance Topology edges ──
    if (showRoleInstances && roleGroups.length > 0) {
      // Edges from occupation nodes → their instances (merged groups)
      if (showOccupationView && data.occupations) {
        for (const occ of data.occupations) {
          const matchedGroup = roleGroups.find((g) => g.matchingOccupationId === occ.id);
          if (!matchedGroup || !expandedRoleGroups.has(matchedGroup.key)) continue;
          const occNodeId = `occ-${occ.id}`;
          if (!nodeIds.has(occNodeId)) continue;
          for (const inst of matchedGroup.instances) {
            const riId = `ri-${inst.id}`;
            if (!nodeIds.has(riId)) continue;
            links.push({
              id: `occ-ri-${inst.id}`,
              source: occNodeId,
              target: riId,
              type: "contains",
              weight: 2,
              color: "rgba(14, 165, 233, 0.4)",
            });
          }
        }
      }
      // Edges from standalone role groups → their instances
      for (const group of roleGroups) {
        if (group.matchingOccupationId) continue; // already handled above
        const rgId = `rg-${group.key}`;
        if (!nodeIds.has(rgId)) continue;

        if (expandedRoleGroups.has(group.key)) {
          for (const inst of group.instances) {
            const riId = `ri-${inst.id}`;
            if (!nodeIds.has(riId)) continue;
            links.push({
              id: `rg-ri-${inst.id}`,
              source: rgId,
              target: riId,
              type: "contains",
              weight: 2,
              color: "rgba(14, 165, 233, 0.4)",
            });
          }
        }
      }
    }

    // ── Career Event edges (instance → event, event → skill) ──
    if (showRoleInstances && data.careerEvents?.length > 0) {
      for (const evt of data.careerEvents) {
        const evtNodeId = `evt-${evt.id}`;
        if (!nodeIds.has(evtNodeId)) continue;
        const instanceId = `ri-${evt.workHistoryId}`;
        // Edge from role instance → event
        if (nodeIds.has(instanceId)) {
          links.push({
            id: `ri-evt-${evt.id}`,
            source: instanceId,
            target: evtNodeId,
            type: "contains",
            weight: 1.5,
            color: "rgba(245, 158, 11, 0.5)",
          });
        }
        // Edges from event → tagged skill nodes
        for (const skill of evt.skills) {
          if (nodeIds.has(skill.skillNodeId)) {
            links.push({
              id: `evt-sk-${evt.id}-${skill.skillNodeId}`,
              source: evtNodeId,
              target: skill.skillNodeId,
              type: "event_skill",
              weight: 1,
              color: "rgba(245, 158, 11, 0.35)",
            });
          }
        }
      }
    }

    let result = { nodes, links };

    // ── Focus mode filtering ──
    if (focusNodeId) {
      const focusIds = new Set<string>([focusNodeId]);
      // Include children (contains edges)
      for (const l of links) {
        if (l.source === focusNodeId || (typeof l.source === "object" && (l.source as GraphNode).id === focusNodeId)) {
          const targetId = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
          focusIds.add(targetId);
        }
        if (l.target === focusNodeId || (typeof l.target === "object" && (l.target as GraphNode).id === focusNodeId)) {
          const sourceId = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
          focusIds.add(sourceId);
        }
      }
      // Also include skills connected to focused node or its children via requires edges
      for (const l of links) {
        const srcId = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
        const tgtId = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
        if (focusIds.has(srcId)) focusIds.add(tgtId);
        if (focusIds.has(tgtId)) focusIds.add(srcId);
      }
      result = {
        nodes: nodes.filter((n) => focusIds.has(n.id)),
        links: links.filter((l) => {
          const srcId = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
          const tgtId = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
          return focusIds.has(srcId) && focusIds.has(tgtId);
        }),
      };
    }

    // Preserve positions from previous render to prevent simulation reheat scatter.
    // For NEW nodes (e.g. expanded instances), seed them near their parent so they
    // don't spawn at (0,0) and push everything apart via charge force.
    const prev = prevNodePositions.current;
    for (const node of result.nodes) {
      const n = node as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const cached = prev.get(node.id);
      if (cached) {
        n.x = cached.x;
        n.y = cached.y;
        n.vx = cached.vx;
        n.vy = cached.vy;
      } else if (node.isRoleInstance && node.roleGroupKey) {
        // New instance node — place near its parent role group / occupation node
        const parentNodeId = roleGroupParentNodeId.get(node.roleGroupKey);
        const parentPos = parentNodeId ? prev.get(parentNodeId) : undefined;
        if (parentPos) {
          n.x = parentPos.x + (Math.random() - 0.5) * 40;
          n.y = parentPos.y + (Math.random() - 0.5) * 40;
          n.vx = 0;
          n.vy = 0;
        }
      } else if (node.isCareerEvent && node.workHistoryId) {
        // New event node — place near its parent role instance
        const parentPos = prev.get(`ri-${node.workHistoryId}`);
        if (parentPos) {
          n.x = parentPos.x + (Math.random() - 0.5) * 30;
          n.y = parentPos.y + (Math.random() - 0.5) * 30;
          n.vx = 0;
          n.vy = 0;
        }
      }
    }

    return result;
  }, [data, showMarketView, showEvidenceView, showOccupationView, showDiffusion, showTransferable, edmByNodeId, edmSplatSource, splatByNodeId, showRoleInstances, roleGroups, expandedRoleGroups, expandedInstances, focusNodeId, educationEntries]);

  // Snapshot node positions after each tick so the next gd recompute can restore them
  useEffect(() => {
    const interval = setInterval(() => {
      const map = new Map<string, { x: number; y: number; vx: number; vy: number }>();
      for (const node of gd.nodes) {
        const n = node as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (n.x != null && n.y != null) {
          map.set(node.id, { x: n.x, y: n.y, vx: n.vx ?? 0, vy: n.vy ?? 0 });
        }
      }
      if (map.size > 0) prevNodePositions.current = map;
    }, 500);
    return () => clearInterval(interval);
  }, [gd.nodes]);

  // ── Company hull groupings (maps company name → color index) ──
  const companyColorMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const n of gd.nodes) {
      if (n.company && !map.has(n.company)) {
        map.set(n.company, idx % COMPANY_HULL_COLORS.length);
        idx++;
      }
    }
    return map;
  }, [gd.nodes]);

  // Draw convex-hull backgrounds behind company-grouped nodes
  const drawCompanyHulls = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (companyColorMap.size === 0) return;

      // Group positioned occupation nodes (+ their linked skill nodes) by company
      const groups = new Map<string, { x: number; y: number }[]>();

      // First pass: occupation nodes with company
      const occNodesByCompany = new Map<string, Set<string>>();
      for (const n of gd.nodes) {
        if (!n.company || n.x == null || n.y == null) continue;
        if (!groups.has(n.company)) groups.set(n.company, []);
        groups.get(n.company)!.push({ x: n.x, y: n.y });
        if (!occNodesByCompany.has(n.company)) occNodesByCompany.set(n.company, new Set());
        occNodesByCompany.get(n.company)!.add(n.id);
      }

      // Second pass: include skill nodes linked to this company's occupations via "requires" edges
      for (const [company, occIds] of occNodesByCompany) {
        for (const link of gd.links) {
          const srcId = typeof link.source === "object" ? (link.source as GraphNode).id : link.source;
          const tgtId = typeof link.target === "object" ? (link.target as GraphNode).id : link.target;
          if (link.type !== "requires") continue;
          const skillId = occIds.has(srcId) ? tgtId : occIds.has(tgtId) ? srcId : null;
          if (!skillId) continue;
          const skillNode = gd.nodes.find((n) => n.id === skillId);
          if (skillNode?.x != null && skillNode?.y != null) {
            groups.get(company)!.push({ x: skillNode.x, y: skillNode.y });
          }
        }
      }

      // Draw a rounded hull for each company group
      for (const [company, points] of groups) {
        if (points.length < 1) continue;
        const colorIdx = companyColorMap.get(company) ?? 0;

        if (points.length === 1) {
          // Single node: draw a circle
          ctx.beginPath();
          ctx.arc(points[0].x, points[0].y, 30, 0, 2 * Math.PI);
          ctx.fillStyle = COMPANY_HULL_COLORS[colorIdx];
          ctx.fill();
          ctx.strokeStyle = COMPANY_BORDER_COLORS[colorIdx];
          ctx.lineWidth = 1;
          ctx.stroke();
          continue;
        }

        // Compute bounding box with padding
        const pad = 25;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const r = 12; // corner radius
        const x = minX - pad;
        const y = minY - pad;
        const w = maxX - minX + pad * 2;
        const h = maxY - minY + pad * 2;

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();

        ctx.fillStyle = COMPANY_HULL_COLORS[colorIdx];
        ctx.fill();
        ctx.strokeStyle = COMPANY_BORDER_COLORS[colorIdx];
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Company label at top-left of hull
        ctx.font = "bold 11px Sans-Serif";
        ctx.fillStyle = COMPANY_BORDER_COLORS[colorIdx].replace("0.35", "0.7");
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(company, x + 6, y - 2);
      }
    },
    [gd.nodes, gd.links, companyColorMap]
  );

  // Node click handler — show local graph (selected node + neighbors)
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      // Expandable node (role group or occupation with work history instances)
      if (node.isRoleGroup && (node.instanceCount ?? 0) > 0) {
        const key = node.roleGroupKey ?? node.id.replace("rg-", "");
        setExpandedRoleGroups((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        });
        setSelectedNode(node.id === selectedNode ? null : node.id);
        return;
      }
      // Role instance — expand/collapse its career events
      if (node.isRoleInstance && node.workHistoryId) {
        setExpandedInstances((prev) => {
          const next = new Set(prev);
          if (next.has(node.workHistoryId!)) next.delete(node.workHistoryId!); else next.add(node.workHistoryId!);
          return next;
        });
        setSelectedNode(node.id === selectedNode ? null : node.id);
        return;
      }
      setSelectedNode(node.id === selectedNode ? null : node.id);
    },
    [selectedNode]
  );

  // Enter focus mode — drills into a node showing only its neighborhood
  const enterFocus = useCallback(
    (nodeId: string, label: string) => {
      // Expand the node so instances are visible in focus
      const node = gd.nodes.find((n) => n.id === nodeId);
      if (node?.isRoleGroup || (node?.isOccupation && node.instanceCount)) {
        const key = node.roleGroupKey ?? nodeId.replace("rg-", "");
        setExpandedRoleGroups((prev) => new Set(prev).add(key));
      }
      setFocusBreadcrumb((prev) => [...prev, { id: nodeId, label }]);
      setFocusNodeId(nodeId);
      setSelectedNode(nodeId);
    },
    [gd.nodes]
  );

  const exitFocus = useCallback(() => {
    setFocusNodeId(null);
    setFocusBreadcrumb([]);
  }, []);

  const focusBack = useCallback(() => {
    setFocusBreadcrumb((prev) => {
      if (prev.length <= 1) {
        setFocusNodeId(null);
        return [];
      }
      const next = prev.slice(0, -1);
      setFocusNodeId(next[next.length - 1].id);
      return next;
    });
  }, []);

  // Selected node detail
  const selectedNodeData = data?.nodes.find((n) => n.id === selectedNode);
  const selectedOccupation = selectedNode?.startsWith("occ-")
    ? data?.occupations?.find((o) => `occ-${o.id}` === selectedNode)
    : null;
  const selectedRoleGroup = selectedNode?.startsWith("rg-")
    ? roleGroups.find((g) => `rg-${g.key}` === selectedNode)
    : null;
  const selectedRoleInstance = selectedNode?.startsWith("ri-")
    ? (() => {
        const whId = selectedNode.replace("ri-", "");
        const wh = data?.workHistories?.find((w) => w.id === whId);
        return wh ?? null;
      })()
    : null;
  const selectedEducation = selectedNode?.startsWith("edu-")
    ? (() => {
        const whId = selectedNode.replace("edu-", "");
        return educationEntries.find((w) => w.id === whId) ?? null;
      })()
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
      // Moderate charge — enough to spread nodes but not scatter on expand
      graphRef.current.d3Force("charge")?.strength(-80);
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
            {totalNodes} skills · {totalEdges} connections · {provenNodes} with evidence{totalOccupations > 0 ? ` · ${totalOccupations} occupations` : ""}{(data?.workHistories?.length ?? 0) > 0 ? ` · ${data!.workHistories.length} roles` : ""}
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

          <Button
            variant={showRoleInstances ? "default" : "outline"}
            size="sm"
            onClick={() => setShowRoleInstances(!showRoleInstances)}
            disabled={(data?.workHistories?.length ?? 0) === 0}
            title="Show work history role instances in the graph"
          >
            {showRoleInstances ? <Building2 className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Roles
          </Button>

          <Button
            variant={showAnalytics ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAnalytics(!showAnalytics)}
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            Analytics
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* Actions */}
          <Button size="sm" variant="outline" onClick={() => setShowAddNode(true)}>
            <Plus className="h-4 w-4 mr-1" /> Skill
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddEdge(true)} disabled={totalNodes < 2}>
            <Link2 className="h-4 w-4 mr-1" /> Connect
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => syncProfile.mutate()}
            disabled={syncProfile.isPending}
          >
            {syncProfile.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <User className="h-4 w-4 mr-1" />
            )}
            Sync Profile
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => generateEDM.mutate()}
            disabled={generateEDM.isPending}
            title="Generate Experience Diffusion Map from your work history"
          >
            {generateEDM.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Flame className="h-4 w-4 mr-1" />
            )}
            Diffusion Map
          </Button>

          <div className="w-px h-6 bg-border" />

          {/* EDM view toggles */}
          <Button
            size="sm"
            variant={showDiffusion ? "default" : "outline"}
            onClick={() => {
              const next = !showDiffusion;
              setShowDiffusion(next);
              if (!next) setEdmSplatSource(null); // clear splat when turning off diffusion
            }}
            title="Toggle intensity heatmap view"
          >
            <Layers className="h-4 w-4 mr-1" />
            Intensity
          </Button>

          <Button
            size="sm"
            variant={showTransferable ? "default" : "outline"}
            onClick={() => setShowTransferable(!showTransferable)}
            title="Highlight transferable skills (used across 2+ roles)"
          >
            <ArrowUpRight className="h-4 w-4 mr-1" />
            Transferable
          </Button>

          {/* Per-role splat selector */}
          {showDiffusion && splatSources?.sources && splatSources.sources.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3">
                <Flame className="h-4 w-4 mr-1" />
                {edmSplatSource
                  ? splatSources.sources.find((s) => s.workHistoryId === edmSplatSource)?.label ?? "Role Splat"
                  : "Role Splat"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {edmSplatSource && (
                  <DropdownMenuItem onClick={() => setEdmSplatSource(null)}>
                    <Layers className="h-4 w-4 mr-2" />
                    Show All (Accumulated)
                  </DropdownMenuItem>
                )}
                {splatSources.sources.map((src) => (
                  <DropdownMenuItem
                    key={src.workHistoryId}
                    onClick={() => setEdmSplatSource(src.workHistoryId)}
                  >
                    <Briefcase className="h-4 w-4 mr-2" />
                    {src.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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

          <Button size="sm" variant="outline" onClick={() => setShowOnetSearch(true)}>
            <Search className="h-4 w-4 mr-1" /> O*NET Search
          </Button>

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

          <div className="w-px h-6 bg-border" />

          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!confirm("Clear the entire skill graph? This removes all skills, connections, occupations, evidence, and diffusion data. This cannot be undone.")) return;
              clearGraph.mutate();
            }}
            disabled={clearGraph.isPending || (totalNodes === 0 && totalOccupations === 0 && roleGroups.length === 0)}
          >
            {clearGraph.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Clear Graph
          </Button>
        </div>
      </div>

      {/* ── Analytics Dashboard ── */}
      {showAnalytics && data && (
        <SkillGraphAnalytics data={data} />
      )}

      {/* ── Graph + Detail Panel ── */}
      {!showAnalytics && <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Graph Canvas */}
        <Card className="lg:col-span-3 !py-0">
          <CardContent className="p-0">
            <div ref={containerRef} className="w-full h-[calc(100vh-11rem)] min-h-[500px] relative">
              {/* Focus mode breadcrumb */}
              {focusNodeId && (
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-background/90 backdrop-blur rounded-md px-2 py-1 border shadow-sm">
                  <Button size="sm" variant="ghost" className="h-6 px-1" onClick={exitFocus}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={exitFocus}>
                    All Nodes
                  </button>
                  {focusBreadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <button
                        className={`text-xs ${i === focusBreadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => {
                          if (i < focusBreadcrumb.length - 1) {
                            setFocusBreadcrumb((prev) => prev.slice(0, i + 1));
                            setFocusNodeId(crumb.id);
                          }
                        }}
                      >
                        {crumb.label}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {gd.nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                  <Network className="h-12 w-12 opacity-30" />
                  <p className="text-base font-medium text-foreground">Build your skill graph</p>
                  <p className="text-sm text-center max-w-sm">
                    Pull skills from your work history, equipment, certifications, and more.
                  </p>

                  {/* Primary CTA: Sync from Profile (no AI needed) */}
                  <Button
                    size="sm"
                    onClick={() => syncProfile.mutate()}
                    disabled={syncProfile.isPending}
                  >
                    {syncProfile.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <User className="h-4 w-4 mr-1" />
                    )}
                    Sync from Profile
                  </Button>
                  <p className="text-xs text-muted-foreground max-w-xs text-center">
                    Imports job titles as occupations, skills used &amp; gained, tech stack, equipment, certifications, and learning items.
                  </p>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="w-8 h-px bg-border" />
                    or
                    <span className="w-8 h-px bg-border" />
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ingest.mutate({ source: "resume" })}
                      disabled={ingest.isPending}
                    >
                      {ingest.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1" />
                      )}
                      AI Extract from Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ingest.mutate({ source: "job_postings" })}
                      disabled={ingest.isPending}
                    >
                      {ingest.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-1" />
                      )}
                      AI Extract from Jobs
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="w-8 h-px bg-border" />
                    or
                    <span className="w-8 h-px bg-border" />
                  </div>

                  {profileData?.industryGroup ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => seedScaffold.mutate(profileData.industryGroup!)}
                        disabled={seedScaffold.isPending}
                      >
                        {seedScaffold.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Globe className="h-4 w-4 mr-1" />
                        )}
                        Seed {profileData.industryGroup} Skills
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        or <button className="text-primary underline" onClick={() => setShowScaffold(true)}>browse all industries</button>
                      </p>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setShowScaffold(true)}>
                      <Globe className="h-4 w-4 mr-1" /> Seed an Industry Scaffold
                    </Button>
                  )}
                </div>
              ) : (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={gd}
                  width={dimensions.width}
                  height={dimensions.height}
                  onRenderFramePre={(ctx: CanvasRenderingContext2D) => drawCompanyHulls(ctx)}
                  nodeLabel={(node: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                    const n = node as GraphNode;
                    if (n.isRoleGroup) {
                      const key = n.roleGroupKey ?? n.id.replace("rg-", "");
                      const isExp = expandedRoleGroups.has(key);
                      return `${n.name}${n.instanceCount ? ` (${n.instanceCount})` : ""} — Click to ${isExp ? "collapse" : "expand"}`;
                    }
                    if (n.isRoleInstance) {
                      return `${n.name} [Role Instance]${n.startDate ? ` — ${n.startDate} to ${n.endDate ?? "Present"}` : ""}`;
                    }
                    if (n.isEducation) {
                      return `${n.name} [Education]${n.startDate ? ` — ${n.startDate} to ${n.endDate ?? "Present"}` : ""}`;
                    }
                    const ev = n.evidenceCount > 0 ? ` (${n.evidenceCount} evidence, ${Math.round(n.evidenceStrength)}% strength)` : "";
                    const edmEntry = edmByNodeId.get(n.id);
                    const splatEntry = splatByNodeId.get(n.id);
                    let edmInfo = "";
                    if (splatEntry) {
                      const zoneName = EDM_ZONE_LABELS[splatEntry.zone as keyof typeof EDM_ZONE_LABELS] ?? splatEntry.zone;
                      edmInfo = ` | Zone: ${zoneName} (${Math.round(splatEntry.intensity * 100)}%)`;
                    } else if (edmEntry) {
                      edmInfo = ` | Intensity: ${Math.round(edmEntry.accumulatedIntensity * 100)}%${edmEntry.transferable ? " ★ Transferable" : ""} (${edmEntry.sourceCount} role${edmEntry.sourceCount !== 1 ? "s" : ""})`;
                    }
                    return `${n.name} [${n.type}]${ev}${edmInfo}`;
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
                    const fontSize = Math.round(Math.max(10, 12 / globalScale));
                    ctx.font = `${fontSize}px Sans-Serif`;

                    const radius = Math.max(4, n.val);
                    const x = Math.round(n.x ?? 0);
                    const y = Math.round(n.y ?? 0);

                    if (n.isRoleGroup && !n.isOccupation) {
                      // ── Rounded rectangle for standalone role group nodes ──
                      const textWidth = ctx.measureText(label).width;
                      const w = Math.max(radius * 3, textWidth + 12);
                      const h = radius * 2;
                      const r = 5; // corner radius
                      const rx = x - w / 2;
                      const ry = y - h / 2;
                      ctx.beginPath();
                      ctx.moveTo(rx + r, ry);
                      ctx.lineTo(rx + w - r, ry);
                      ctx.arcTo(rx + w, ry, rx + w, ry + r, r);
                      ctx.lineTo(rx + w, ry + h - r);
                      ctx.arcTo(rx + w, ry + h, rx + w - r, ry + h, r);
                      ctx.lineTo(rx + r, ry + h);
                      ctx.arcTo(rx, ry + h, rx, ry + h - r, r);
                      ctx.lineTo(rx, ry + r);
                      ctx.arcTo(rx, ry, rx + r, ry, r);
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#0284c7" : n.color;
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.4)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                      // Expand indicator
                      const key = n.roleGroupKey ?? n.id.replace("rg-", "");
                      const isExp = expandedRoleGroups.has(key);
                      ctx.fillStyle = "rgba(255,255,255,0.7)";
                      ctx.font = `${Math.round(Math.max(8, 10 / globalScale))}px Sans-Serif`;
                      ctx.textAlign = "left";
                      ctx.textBaseline = "middle";
                      ctx.fillText(isExp ? "▾" : "▸", rx + 3, y);
                      // Label inside
                      ctx.fillStyle = "rgba(255,255,255,0.95)";
                      ctx.font = `${fontSize}px Sans-Serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";
                      ctx.fillText(label, x, y);
                    } else if (n.isRoleInstance) {
                      // ── Diamond shape for role instance nodes ──
                      const s = radius * 1.2;
                      ctx.beginPath();
                      ctx.moveTo(x, y - s);
                      ctx.lineTo(x + s, y);
                      ctx.lineTo(x, y + s);
                      ctx.lineTo(x - s, y);
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#0284c7" : n.color;
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.5)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                      // Label below
                      if (globalScale > 0.5 || n.id === selectedNode || n.id === hoveredNode) {
                        ctx.fillStyle = "rgba(255,255,255,0.9)";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "top";
                        const hasEvents = n.workHistoryId && data?.careerEvents?.some((e: CareerEventEntry) => e.workHistoryId === n.workHistoryId);
                        const isExp = n.workHistoryId ? expandedInstances.has(n.workHistoryId) : false;
                        const indicator = hasEvents ? (isExp ? " ▾" : " ▸") : "";
                        ctx.fillText(label + indicator, x, y + s + 2);
                      }
                    } else if (n.isEducation) {
                      // ── Book/square shape for education nodes ──
                      const sz = radius * 1.3;
                      const rx = x - sz;
                      const ry = y - sz;
                      ctx.beginPath();
                      ctx.rect(rx, ry, sz * 2, sz * 2);
                      ctx.fillStyle = n.id === selectedNode ? "#7c3aed" : "#a78bfa";
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.5)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                      // Small "cap" triangle on top to hint at graduation cap
                      ctx.beginPath();
                      ctx.moveTo(x - sz * 0.6, ry);
                      ctx.lineTo(x, ry - sz * 0.5);
                      ctx.lineTo(x + sz * 0.6, ry);
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#7c3aed" : "#a78bfa";
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.5)";
                      ctx.stroke();
                      // Label below
                      if (globalScale > 0.4 || n.id === selectedNode || n.id === hoveredNode) {
                        ctx.fillStyle = "rgba(255,255,255,0.9)";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "top";
                        ctx.fillText(label, x, y + sz + 2);
                      }
                    } else if (n.isOccupation) {
                      // Draw hexagon for occupation nodes
                      const hexR = radius * 1.3;
                      ctx.beginPath();
                      for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i - Math.PI / 6;
                        const hx = x + hexR * Math.cos(angle);
                        const hy = y + hexR * Math.sin(angle);
                        if (i === 0) ctx.moveTo(hx, hy);
                        else ctx.lineTo(hx, hy);
                      }
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#e11d48" : NODE_TYPE_COLORS.occupation;
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.6)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                      // Expand indicator if this occupation has work history instances
                      if (n.isRoleGroup && (n.instanceCount ?? 0) > 0) {
                        const key = n.roleGroupKey ?? "";
                        const isExp = expandedRoleGroups.has(key);
                        ctx.fillStyle = "rgba(255,255,255,0.85)";
                        ctx.font = `bold ${Math.round(Math.max(8, 10 / globalScale))}px Sans-Serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText(isExp ? "▾" : "▸", x, y);
                      }
                    } else if (n.isCareerEvent) {
                      // ── Amber pill/capsule shape for career event nodes ──
                      const pillW = Math.max(radius * 2.5, ctx.measureText(label).width + 10);
                      const pillH = radius * 1.6;
                      const pillR = pillH / 2;
                      const px = x - pillW / 2;
                      const py = y - pillH / 2;
                      ctx.beginPath();
                      ctx.moveTo(px + pillR, py);
                      ctx.lineTo(px + pillW - pillR, py);
                      ctx.arc(px + pillW - pillR, py + pillR, pillR, -Math.PI / 2, Math.PI / 2);
                      ctx.lineTo(px + pillR, py + pillH);
                      ctx.arc(px + pillR, py + pillR, pillR, Math.PI / 2, -Math.PI / 2);
                      ctx.closePath();
                      ctx.fillStyle = n.id === selectedNode ? "#d97706" : "#f59e0b";
                      ctx.fill();
                      ctx.strokeStyle = n.id === selectedNode ? "#ffffff" : "rgba(255,255,255,0.5)";
                      ctx.lineWidth = 1.5 / globalScale;
                      ctx.stroke();
                      // Label inside pill
                      if (globalScale > 0.5 || n.id === selectedNode || n.id === hoveredNode) {
                        ctx.fillStyle = "rgba(0,0,0,0.85)";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        const maxChars = Math.floor(pillW / (fontSize * 0.55));
                        const truncated = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
                        ctx.fillText(truncated, x, y);
                      }
                    } else {
                      const edmEntry = edmByNodeId.get(n.id);
                      const isTransferable = edmEntry?.transferable ?? false;
                      const edmIntensity = edmEntry?.accumulatedIntensity ?? 0;
                      const splatEntry = splatByNodeId.get(n.id);

                      // Per-role splat zone ring
                      if (edmSplatSource && splatEntry) {
                        const zoneColor = EDM_ZONE_COLORS[splatEntry.zone as keyof typeof EDM_ZONE_COLORS] ?? "#6b7280";
                        ctx.beginPath();
                        ctx.arc(x, y, radius + 4 / globalScale, 0, 2 * Math.PI);
                        ctx.strokeStyle = zoneColor;
                        ctx.lineWidth = 2.5 / globalScale;
                        ctx.stroke();
                      }

                      // Transferable glow ring (outer ring before main circle)
                      if (showTransferable && isTransferable) {
                        ctx.beginPath();
                        ctx.arc(x, y, radius + 3 / globalScale, 0, 2 * Math.PI);
                        ctx.strokeStyle = `rgba(245, 158, 11, ${0.4 + edmIntensity * 0.4})`;
                        ctx.lineWidth = (2 + edmEntry!.sourceCount) / globalScale;
                        ctx.stroke();
                      }

                      // EDM intensity outer ring
                      if (showDiffusion && edmIntensity > 0) {
                        ctx.beginPath();
                        ctx.arc(x, y, radius + 2 / globalScale, 0, 2 * Math.PI);
                        ctx.strokeStyle = `rgba(245, 158, 11, ${edmIntensity * 0.6})`;
                        ctx.lineWidth = 1.5 / globalScale;
                        ctx.stroke();
                      }

                      ctx.beginPath();
                      ctx.arc(x, y, radius, 0, 2 * Math.PI);

                      // Glow effect for evidence nodes
                      if (n.evidenceCount > 0) {
                        ctx.shadowColor = n.color;
                        ctx.shadowBlur = 8 + n.evidenceStrength / 10;
                      }

                      // Dim nodes in transferable mode that aren't transferable
                      // or in splat mode that aren't part of the selected role
                      if (showTransferable && !isTransferable && !n.isOccupation) {
                        ctx.globalAlpha = 0.25;
                      } else if (edmSplatSource && !splatByNodeId.has(n.id) && !n.isOccupation) {
                        ctx.globalAlpha = 0.15;
                      }

                      ctx.fillStyle = n.id === selectedNode ? "#3b82f6" : n.color;
                      ctx.fill();
                      ctx.shadowBlur = 0;
                      ctx.globalAlpha = 1;

                      // Selected ring
                      if (n.id === selectedNode) {
                        ctx.strokeStyle = "#ffffff";
                        ctx.lineWidth = 2 / globalScale;
                        ctx.stroke();
                      }
                    }

                    // Label (only for nodes that don't render their own — skip role groups, instances, education)
                    if (!n.isRoleGroup && !n.isRoleInstance && !n.isEducation && !n.isCareerEvent) {
                      if (globalScale > 0.6 || n.id === selectedNode || n.id === hoveredNode || n.isOccupation) {
                        ctx.fillStyle = "rgba(255,255,255,0.9)";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "top";
                        ctx.fillText(label, x, y + radius + 2);
                      }
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
                    return l.type === "requires" || l.type === "contains" || l.type === "maps_to" ? [4, 2] : null;
                  }}
                  onNodeClick={(node: any) => handleNodeClick(node as GraphNode)} // eslint-disable-line @typescript-eslint/no-explicit-any
                  onNodeHover={(node: any) => setHoveredNode(node?.id ?? null)} // eslint-disable-line @typescript-eslint/no-explicit-any
                  cooldownTicks={200}
                  d3AlphaDecay={0.03}
                  d3VelocityDecay={0.4}
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

              {generateEDM.isPending && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating diffusion map from your work history...
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card className="lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {selectedRoleGroup
                ? selectedRoleGroup.title
                : selectedRoleInstance
                  ? `${selectedRoleInstance.title ?? selectedRoleInstance.company}`
                  : selectedEducation
                    ? `${selectedEducation.company || selectedEducation.title || "School"}`
                    : selectedOccupation
                      ? selectedOccupation.title
                      : selectedNodeData
                        ? selectedNodeData.name
                        : "Node Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRoleGroup ? (
              <>
                {/* ── Role Group detail panel ── */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                    <Building2 className="h-3 w-3 mr-1" /> Role Group
                  </Badge>
                  <Badge variant="secondary">{selectedRoleGroup.instances.length} instance{selectedRoleGroup.instances.length !== 1 ? "s" : ""}</Badge>
                </div>

                {/* Instances list */}
                <div>
                  <h4 className="text-base font-medium mb-2 flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" /> Work History
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedRoleGroup.instances.map((inst) => {
                      const months = inst.startDate ? (() => {
                        const [sy, sm] = inst.startDate.split("-").map(Number);
                        const end = inst.endDate ? inst.endDate.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
                        return (end[0] - sy) * 12 + (end[1] - sm);
                      })() : null;
                      const tenure = months != null ? (months >= 12 ? `${Math.floor(months / 12)}yr ${months % 12}mo` : `${months}mo`) : null;
                      const hasSplat = splatSources?.sources?.some((s) => s.workHistoryId === inst.id);
                      return (
                        <div key={inst.id} className="p-2 rounded border bg-muted/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{inst.company}</span>
                            {tenure && <span className="text-xs text-muted-foreground">{tenure}</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {inst.startDate ?? "?"} — {inst.endDate ?? "Present"}
                          </div>
                          {hasSplat && (
                            <Button
                              size="sm"
                              variant={edmSplatSource === inst.id ? "default" : "outline"}
                              className="mt-1 h-7 text-xs"
                              onClick={() => {
                                setEdmSplatSource(edmSplatSource === inst.id ? null : inst.id);
                                setShowDiffusion(true);
                              }}
                            >
                              <Flame className="h-3 w-3 mr-1" />
                              {edmSplatSource === inst.id ? "Hide Splat" : "View Splat"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Matching occupation link */}
                {selectedRoleGroup.matchingOccupationId && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Hexagon className="h-3 w-3" />
                      Linked to O*NET occupation
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 h-7 text-xs"
                      onClick={() => setSelectedNode(`occ-${selectedRoleGroup.matchingOccupationId}`)}
                    >
                      View Occupation →
                    </Button>
                  </div>
                )}

                {/* Focus mode */}
                <div className="pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => enterFocus(`rg-${selectedRoleGroup.key}`, selectedRoleGroup.title)}
                  >
                    <Focus className="h-3.5 w-3.5 mr-1" /> Focus on Role
                  </Button>
                </div>
              </>
            ) : selectedRoleInstance ? (
              <>
                {/* ── Role Instance detail panel ── */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                    <Building2 className="h-3 w-3 mr-1" /> Role Instance
                  </Badge>
                  <Badge variant="outline">
                    <Briefcase className="h-3 w-3 mr-1" /> {selectedRoleInstance.company}
                  </Badge>
                  <Badge variant="secondary" className="capitalize">{selectedRoleInstance.type}</Badge>
                </div>

                {/* Timeline */}
                <div className="space-y-2">
                  <h4 className="text-base font-medium flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" /> Timeline
                  </h4>
                  <div className="flex items-center gap-2 text-sm">
                    <span>{selectedRoleInstance.startDate ?? "Unknown"}</span>
                    <span className="flex-1 h-px bg-border" />
                    <span>{selectedRoleInstance.endDate ?? "Present"}</span>
                  </div>
                  {selectedRoleInstance.startDate && (() => {
                    const [sy, sm] = selectedRoleInstance.startDate!.split("-").map(Number);
                    const end = selectedRoleInstance.endDate ? selectedRoleInstance.endDate.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
                    const months = (end[0] - sy) * 12 + (end[1] - sm);
                    const tenureFactor = Math.min(1, months / 24);
                    return (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{months >= 12 ? `${Math.floor(months / 12)}yr ${months % 12}mo` : `${months}mo`}</span>
                          <span>Tenure factor: {(tenureFactor * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${tenureFactor * 100}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Zone breakdown from splat data */}
                {(() => {
                  const whSplat = splatSources?.sources?.find((s) => s.workHistoryId === selectedRoleInstance.id);
                  if (!whSplat) return null;
                  // If this instance's splat is currently loaded, show zone breakdown
                  if (edmSplatSource === selectedRoleInstance.id && splatData?.field) {
                    const zones: Record<string, number> = {};
                    for (const entry of splatData.field) {
                      zones[entry.zone] = (zones[entry.zone] ?? 0) + 1;
                    }
                    return (
                      <div className="space-y-2">
                        <h4 className="text-base font-medium flex items-center gap-1.5">
                          <Flame className="h-4 w-4 text-amber-500" /> Zone Breakdown
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(EDM_ZONE_COLORS).map(([zone, color]) => (
                            <div key={zone} className="flex items-center gap-2 text-sm">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span>{zone}</span>
                              <span className="ml-auto text-muted-foreground">{zones[zone] ?? 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {splatSources?.sources?.some((s) => s.workHistoryId === selectedRoleInstance.id) && (
                    <Button
                      size="sm"
                      variant={edmSplatSource === selectedRoleInstance.id ? "default" : "outline"}
                      onClick={() => {
                        setEdmSplatSource(edmSplatSource === selectedRoleInstance.id ? null : selectedRoleInstance.id);
                        setShowDiffusion(true);
                      }}
                    >
                      <Flame className="h-3.5 w-3.5 mr-1" />
                      {edmSplatSource === selectedRoleInstance.id ? "Hide Splat" : "View Splat"}
                    </Button>
                  )}
                  {/* Navigate to parent group */}
                  {(() => {
                    const group = whToRoleGroup.get(selectedRoleInstance.id);
                    if (!group || group.instances.length <= 1) return null;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedNode(`rg-${group.key}`)}
                      >
                        <Layers className="h-3.5 w-3.5 mr-1" /> View Group
                      </Button>
                    );
                  })()}
                </div>
              </>
            ) : selectedEducation ? (
              <>
                {/* ── Education detail panel ── */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30">
                    <GraduationCap className="h-3 w-3 mr-1" /> Education
                  </Badge>
                  {selectedEducation.degree && (
                    <Badge variant="outline">
                      <Award className="h-3 w-3 mr-1" /> {selectedEducation.degree}
                    </Badge>
                  )}
                  {selectedEducation.major && (
                    <Badge variant="secondary">{selectedEducation.major}</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{selectedEducation.startDate ?? "Unknown"}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span>{selectedEducation.endDate ?? "Present"}</span>
                </div>
                {selectedEducation.title && (
                  <p className="text-sm text-muted-foreground">{selectedEducation.title}</p>
                )}
              </>
            ) : selectedOccupation ? (
              <>
                {/* Occupation detail panel */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                    <Hexagon className="h-3 w-3 mr-1" /> Occupation
                  </Badge>
                  <Badge variant="secondary">{selectedOccupation.socCode}</Badge>
                  {(() => {
                    try {
                      const meta = selectedOccupation.metadata ? JSON.parse(selectedOccupation.metadata) : null;
                      if (meta?.company) return <Badge variant="outline"><Briefcase className="h-3 w-3 mr-1" />{meta.company}</Badge>;
                    } catch { /* ignore */ }
                    return null;
                  })()}
                  {selectedOccupation.interests?.[0]?.status && (
                    <Badge variant="outline" className="capitalize">
                      {selectedOccupation.interests[0].status}
                    </Badge>
                  )}
                </div>

                {selectedOccupation.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedOccupation.description}</p>
                )}

                {/* Work history instances (merged role group) */}
                {(() => {
                  const matchedGroup = roleGroups.find((g) => g.matchingOccupationId === selectedOccupation.id);
                  if (!matchedGroup) return null;
                  return (
                    <div>
                      <h4 className="text-base font-medium mb-2 flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4" /> Work History ({matchedGroup.instances.length})
                      </h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {matchedGroup.instances.map((inst) => {
                          const months = inst.startDate ? (() => {
                            const [sy, sm] = inst.startDate.split("-").map(Number);
                            const end = inst.endDate ? inst.endDate.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
                            return (end[0] - sy) * 12 + (end[1] - sm);
                          })() : null;
                          const tenure = months != null ? (months >= 12 ? `${Math.floor(months / 12)}yr ${months % 12}mo` : `${months}mo`) : null;
                          return (
                            <div key={inst.id} className="p-2 rounded border bg-muted/30 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{inst.company}</span>
                                {tenure && <span className="text-xs text-muted-foreground">{tenure}</span>}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {inst.startDate ?? "?"} — {inst.endDate ?? "Present"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Required skills */}
                <div>
                  <h4 className="text-base font-medium mb-2 flex items-center gap-1.5">
                    <Target className="h-4 w-4" /> Required Skills ({selectedOccupation.requirements.length})
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
                  <Label className="text-sm">Track as</Label>
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

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {/* View Diffusion Splat — match occupation to work history */}
                  {(() => {
                    if (!splatSources?.sources?.length) return null;
                    let company: string | undefined;
                    try {
                      const meta = selectedOccupation.metadata ? JSON.parse(selectedOccupation.metadata) : null;
                      if (meta?.company) company = meta.company;
                    } catch { /* ignore */ }
                    // Find matching work history by title/company substring
                    const match = splatSources.sources.find((s) => {
                      const lbl = s.label.toLowerCase();
                      const titleMatch = lbl.includes(selectedOccupation.title.toLowerCase());
                      const companyMatch = company ? lbl.includes(company.toLowerCase()) : false;
                      return titleMatch || companyMatch;
                    });
                    if (!match) return null;
                    const isActive = edmSplatSource === match.workHistoryId;
                    return (
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        onClick={() => {
                          setEdmSplatSource(isActive ? null : match.workHistoryId);
                          setShowDiffusion(true);
                        }}
                      >
                        <Flame className="h-3.5 w-3.5 mr-1" />
                        {isActive ? "Hide Splat" : "View Splat"}
                      </Button>
                    );
                  })()}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => enterFocus(`occ-${selectedOccupation.id}`, selectedOccupation.title)}
                  >
                    <Focus className="h-3.5 w-3.5 mr-1" /> Focus
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteOccupation.mutate(selectedOccupation.id)}
                    disabled={deleteOccupation.isPending}
                  >
                    {deleteOccupation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                    )}
                    Remove
                  </Button>
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
                  {(() => {
                    const edm = edmByNodeId.get(selectedNodeData.id);
                    if (!edm) return null;
                    return (
                      <>
                        {edm.transferable && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                            <ArrowUpRight className="h-3 w-3 mr-1" /> Transferable
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* EDM Diffusion Info */}
                {(() => {
                  const edm = edmByNodeId.get(selectedNodeData.id);
                  if (!edm) return null;
                  return (
                    <div className="space-y-2">
                      <h4 className="text-base font-medium flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-amber-500" /> Diffusion Intensity
                      </h4>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-amber-500 to-amber-300"
                              style={{ width: `${Math.round(edm.accumulatedIntensity * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {Math.round(edm.accumulatedIntensity * 100)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className="text-muted-foreground">
                          From {edm.sourceCount} role{edm.sourceCount !== 1 ? "s" : ""}
                        </span>
                        {edm.zones.map((z) => (
                          <Badge key={z} variant="outline" className="text-xs py-0">
                            {z}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Connections */}
                <div>
                  <h4 className="text-base font-medium mb-2 flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" /> Connections ({selectedNodeEdges?.length ?? 0})
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
                  <h4 className="text-base font-medium mb-2 flex items-center gap-1.5">
                    <Zap className="h-4 w-4" /> Evidence ({selectedNodeEvidence?.length ?? 0})
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

                  {/* EDM summary when data exists */}
                  {edmData && edmData.field.length > 0 && (
                    <>
                      <h4 className="font-medium text-foreground mt-3 flex items-center gap-1.5">
                        <Flame className="h-3.5 w-3.5 text-amber-500" /> Diffusion Zones
                      </h4>
                      <div className="grid grid-cols-2 gap-1.5 text-xs">
                        {Object.entries(EDM_ZONE_COLORS).map(([zone, color]) => (
                          <div key={zone} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                            <span>{zone}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Total exposure nodes</span>
                          <span className="font-medium">{edmData.field.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Transferable skills</span>
                          <span className="font-medium text-amber-500">{edmData.transferableCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>From roles</span>
                          <span className="font-medium">{edmData.totalSources}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Role Instance Topology summary */}
                  {roleGroups.length > 0 && (
                    <>
                      <h4 className="font-medium text-foreground mt-3 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-sky-500" /> Role Topology
                      </h4>
                      <div className="grid grid-cols-1 gap-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-3 rounded-sm" style={{ backgroundColor: "#0ea5e9" }} />
                          <span>Role group (click to expand)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rotate-45" style={{ backgroundColor: "#38bdf8" }} />
                          <span>Role instance (company)</span>
                        </div>
                      </div>
                      <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span>Role groups</span>
                          <span className="font-medium">{roleGroups.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total instances</span>
                          <span className="font-medium">{roleGroups.reduce((sum, g) => sum + g.instances.length, 0)}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Education summary */}
                  {educationEntries.length > 0 && (
                    <>
                      <h4 className="font-medium text-foreground mt-3 flex items-center gap-1.5">
                        <GraduationCap className="h-3.5 w-3.5 text-violet-400" /> Education
                      </h4>
                      <div className="grid grid-cols-1 gap-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-3 h-3" style={{ backgroundColor: "#a78bfa" }} />
                          <span>Education (school)</span>
                        </div>
                      </div>
                      <div className="mt-2 p-2 rounded bg-muted/50 text-xs">
                        <div className="flex justify-between">
                          <span>Schools</span>
                          <span className="font-medium">{educationEntries.length}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>}

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

      {/* ── O*NET Search Dialog ── */}
      <Dialog open={showOnetSearch} onOpenChange={(open) => {
        setShowOnetSearch(open);
        if (!open) {
          setOnetQuery("");
          setOnetResults([]);
          setOnetPreview(null);
          setOnetPreviewData(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              O*NET Occupation Search
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Search the O*NET database for occupations and import them with their associated skills into your graph.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={onetQuery}
              onChange={(e) => handleOnetSearch(e.target.value)}
              placeholder="Search occupations... e.g. Software Developer, Data Analyst"
              className="pl-9"
              autoFocus
            />
            {onetSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-1">
            {onetResults.length === 0 && onetQuery && !onetSearching && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No occupations found for &ldquo;{onetQuery}&rdquo;
              </p>
            )}
            {!onetQuery && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Start typing to search O*NET occupations
              </p>
            )}
            {onetResults.map((occ) => {
              const isExpanded = onetPreview === occ.code;
              const alreadyImported = data?.occupations?.some((o) => o.socCode === occ.code);
              return (
                <div key={occ.code} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => handleOnetPreview(occ.code)}
                  >
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{occ.title}</span>
                        {occ.brightOutlook && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            <Star className="h-3 w-3 mr-0.5" /> Bright Outlook
                          </Badge>
                        )}
                        {alreadyImported && (
                          <Badge variant="outline" className="text-xs shrink-0 text-green-600 border-green-600">
                            <Check className="h-3 w-3 mr-0.5" /> Imported
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">SOC {occ.code}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={alreadyImported ? "outline" : "default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOnetImport(occ.code);
                      }}
                      disabled={onetImporting === occ.code}
                      className="shrink-0"
                    >
                      {onetImporting === occ.code ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {alreadyImported ? "Update" : "Import"}
                        </>
                      )}
                    </Button>
                  </button>

                  {isExpanded && (
                    <div className="border-t bg-muted/30 p-3">
                      {onetPreviewLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading occupation details...
                        </div>
                      ) : onetPreviewData ? (
                        <div className="space-y-3">
                          {onetPreviewData.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {onetPreviewData.description}
                            </p>
                          )}
                          <div>
                            <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              Skills ({onetPreviewData.skills?.length ?? 0})
                            </h5>
                            <div className="flex flex-wrap gap-1">
                              {onetPreviewData.skills
                                ?.sort((a: any, b: any) => b.importance - a.importance)
                                .slice(0, 15)
                                .map((s: any) => (
                                  <Badge
                                    key={s.id}
                                    variant="secondary"
                                    className="text-xs"
                                    title={`Importance: ${s.importance}`}
                                  >
                                    {s.name}
                                    <span className="ml-1 opacity-50">{s.importance}</span>
                                  </Badge>
                                ))}
                              {(onetPreviewData.skills?.length ?? 0) > 15 && (
                                <Badge variant="outline" className="text-xs">
                                  +{onetPreviewData.skills.length - 15} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          {onetPreviewData.technology?.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                Technology ({onetPreviewData.technology.length})
                              </h5>
                              <div className="flex flex-wrap gap-1">
                                {onetPreviewData.technology.slice(0, 12).map((t: any, i: number) => (
                                  <Badge
                                    key={i}
                                    variant={t.hotTechnology ? "default" : "outline"}
                                    className="text-xs"
                                  >
                                    {t.name}
                                    {t.hotTechnology && <Zap className="h-2.5 w-2.5 ml-0.5" />}
                                  </Badge>
                                ))}
                                {onetPreviewData.technology.length > 12 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{onetPreviewData.technology.length - 12} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Cluster: <strong>{onetPreviewData.cluster}</strong>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CANVAS_NODE_KINDS,
  isCanvasNodeKind,
  prepareCanvasNode,
  removeCanvasNode,
  type CanvasNodeKind,
} from "@core/canvas-node";
import {
  CAREER_HISTORY_SECTIONS,
  classifyCareerHistorySection,
  formatHistoryPeriod,
  formatHistoryPlace,
  type CareerHistorySectionKey,
} from "@core/career-history";
import {
  readCanvasBoards,
  type CanvasBoard,
  type CanvasGroup,
  type CanvasLink,
  type CanvasNode,
} from "@core/canvas-board";
import { achievementStatement } from "@core/role-achievements";
import type { WorkMapRole } from "@core/work-map";
import { Icon } from "./HomeNav";
import "./role-canvas.css";

type Snap = { id: string; name: string; at: number; nodes: CanvasNode[]; groups?: CanvasGroup[] };
type GuideLine = { x1: number; y1: number; x2: number; y2: number };
type Chrome = { left: number; top: number; bottom: number; extraRight: number };

const SNAP_KEY = "proforna-canvas-saves";
const VIEWPORT_KEY = "proforna-canvas-viewports";
const BOARD_KEY = "proforna-canvas-boards";
const vaultBoards = new Map<string, CanvasBoard[]>();
const savedBoardJson = new Map<string, string>();
const pendingBoards = new Map<string, CanvasBoard[]>();
const saveTail = new Map<string, Promise<void>>();
const DESIGN_FILM = "https://www.youtube-nocookie.com/embed/xIZYqNS6so0?rel=0";
const RELATION_KINDS = ["evidence", "example", "design", "outsource", "feedback", "approved"];
const EMPTY_CHROME: Chrome = { left: 0, top: 0, bottom: 0, extraRight: 0 };
type BoardSnap = { boardId: string; nodes: CanvasNode[]; groups: CanvasGroup[] };
type CanvasCommands = {
  closeMenus: () => void;
  undo: () => void;
  redo: () => void;
  selectAll: () => void;
  pasteCenter: () => void;
  copy: () => void;
  duplicate: () => void;
  restackFront: () => void;
  restackBack: () => void;
  toggleLock: () => void;
  deleteSelection: () => void;
};

function cloneBoard(board: CanvasBoard): BoardSnap {
  return {
    boardId: board.id,
    nodes: board.nodes.map((node) => ({
      ...node,
      notes: [...node.notes],
      links: node.links.map((link) => ({ ...link })),
    })),
    groups: board.groups.map((group) => ({ ...group, members: [...group.members] })),
  };
}

function readSnaps(): Record<string, Snap[]> {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

type CanvasViewport = { x: number; y: number; zoom: number };

function viewportKey(roleId: string, boardId: string) {
  return `${roleId}:${boardId}`;
}

function readViewports(): Record<string, CanvasViewport> {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const viewports: Record<string, CanvasViewport> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const item = value as Partial<CanvasViewport>;
      const x = Number(item.x);
      const y = Number(item.y);
      const zoom = Number(item.zoom);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) continue;
      viewports[key] = { x, y, zoom: Math.min(2.5, Math.max(0.35, zoom)) };
    }
    return viewports;
  } catch {
    return {};
  }
}

function readViewport(roleId: string, boardId: string) {
  return readViewports()[viewportKey(roleId, boardId)] ?? null;
}

function writeViewport(roleId: string, boardId: string, viewport: CanvasViewport) {
  try {
    const all = readViewports();
    all[viewportKey(roleId, boardId)] = viewport;
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(all));
  } catch {
    /* storage can be unavailable */
  }
}

export function boardsForRole(role: WorkMapRole): CanvasBoard[] {
  return [
    {
      id: role.id,
      name: role.title || role.organization || "This role",
      nodes: [],
      groups: [],
    },
    ...sampleBoards(),
  ];
}

function sampleBoards(): CanvasBoard[] {
  const card = (
    id: string,
    kind: string,
    title: string,
    body: string,
    x: number,
    y: number,
    extra: Partial<CanvasNode> = {},
  ): CanvasNode => ({
    id,
    kind,
    title,
    body,
    x,
    y,
    url: "",
    notes: [],
    links: [],
    ...extra,
  });
  const link = (id: string, label: string): CanvasLink => ({ key: id, id, label });
  return [
    {
      id: "sample-foldable",
      name: "Foldable",
      nodes: [
        card(
          "design",
          "Design",
          "Foldable",
          "The product itself. The fold, the hinge, and how it sits in the hand.",
          280,
          24,
          { links: [link("demo", "Product demonstration"), link("page", "Hinge notes")] },
        ),
        card("demo", "Demonstration", "Product demonstration", "The review that shows the foldable moving.", 536, 168, {
          links: [link("video", "Foldable design review")],
        }),
        card("video", "Video", "Foldable design review", "Opens here, on its own page inside the project.", 792, 36, {
          url: DESIGN_FILM,
        }),
        card("page", "Page", "Hinge notes", "The hinge study, the fold, and how the pieces sit together.", 216, 168, {
          w: 320,
          h: 220,
        }),
      ],
      groups: [],
    },
    {
      id: "sample-hinge",
      name: "Hinge study",
      nodes: [
        card("hinge", "Design", "Hinge", "The mechanism, kept apart from the whole foldable.", 320, 140),
      ],
      groups: [],
    },
  ];
}

function withoutRoleCard(board: CanvasBoard): CanvasBoard {
  const hadRole =
    board.nodes.some((node) => node.id === "role" || node.links.some((link) => link.id === "role")) ||
    board.groups.some((group) => group.members.includes("role"));
  if (!hadRole) return board;
  const nodes = board.nodes
    .filter((node) => node.id !== "role")
    .map((node) => ({ ...node, links: node.links.filter((link) => link.id !== "role") }));
  const groups = board.groups.flatMap((group) => {
    const members = group.members.filter((id) => id !== "role");
    return members.length > 1 ? [{ ...group, members }] : [];
  });
  return { ...board, nodes, groups };
}

function loadBoards(role: WorkMapRole): CanvasBoard[] {
  const seed = boardsForRole(role);
  const stored = readStoredBoards(role);
  if (!stored) return seed;
  const roleBoard = stored.find((board) => board.id === role.id);
  if (!roleBoard) return seed;
  const extras = stored.filter((board) => board.id !== role.id).map(withoutRoleCard);
  const missing = seed.filter(
    (board) => board.id !== role.id && !extras.some((item) => item.id === board.id),
  );
  return [withoutRoleCard(roleBoard), ...extras, ...missing];
}

function loadAllBoards(roles: WorkMapRole[]): CanvasBoard[] {
  const studies = sampleBoards();
  const studyIds = new Set(studies.map((board) => board.id));
  const collected: CanvasBoard[] = [];
  const seen = new Set<string>();
  for (const item of roles) {
    for (const board of reflectRole(loadBoards(item), item)) {
      if (seen.has(board.id) || studyIds.has(board.id)) continue;
      seen.add(board.id);
      collected.push(board);
    }
  }
  return [...collected, ...studies];
}

function reflectRole(boards: CanvasBoard[], role: WorkMapRole): CanvasBoard[] {
  let changed = false;
  const next = boards.map((board) => {
    const source = withoutRoleCard(board);
    const isRoleBoard = source.id === role.id;
    const name = isRoleBoard ? role.title || role.organization || "This role" : source.name;
    let boardChanged = source !== board || name !== source.name;
    const nodes = source.nodes.map((node) => {
      if (!node.achievementId) return node;
      const statement = achievementStatement(role.achievements, role.achievementIds, node.achievementId);
      if (!statement || node.title === statement) return node;
      boardChanged = true;
      return { ...node, title: statement };
    });
    if (!boardChanged) return source;
    changed = true;
    return { ...source, name, nodes };
  });
  return changed ? next : boards;
}

function readStoredBoards(role: WorkMapRole): CanvasBoard[] | null {
  const cached = vaultBoards.get(role.id);
  if (cached) return cached;
  const fromVault = readCanvasBoards(role.canvasBoards);
  if (fromVault) {
    vaultBoards.set(role.id, fromVault);
    savedBoardJson.set(role.id, JSON.stringify(fromVault));
    return fromVault;
  }
  return readLegacyBoards(role.id);
}

function readLegacyBoards(roleId: string): CanvasBoard[] | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    return readCanvasBoards((parsed as Record<string, unknown>)[roleId]);
  } catch {
    return null;
  }
}

function forgetLegacyBoards(roleId: string) {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || !(roleId in parsed)) return;
    delete parsed[roleId];
    if (Object.keys(parsed).length === 0) localStorage.removeItem(BOARD_KEY);
    else localStorage.setItem(BOARD_KEY, JSON.stringify(parsed));
  } catch {
    /* storage can be unavailable */
  }
}

function scheduleVaultSave(roleId: string, boards: CanvasBoard[]) {
  const json = JSON.stringify(boards);
  vaultBoards.set(roleId, boards);
  if (savedBoardJson.get(roleId) === json) return;
  pendingBoards.set(roleId, boards);
  const previous = saveTail.get(roleId) ?? Promise.resolve();
  const next = previous.then(() => sendLatestBoards(roleId), () => sendLatestBoards(roleId));
  saveTail.set(roleId, next);
}

async function sendLatestBoards(roleId: string) {
  const boards = pendingBoards.get(roleId);
  if (!boards) return;
  pendingBoards.delete(roleId);
  const json = JSON.stringify(boards);
  if (savedBoardJson.get(roleId) === json) return;
  let response: Response;
  try {
    response = await fetch(`/api/work-map/roles/${roleId}/canvas`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: `{"boards":${json}}`,
    });
  } catch {
    if (!pendingBoards.has(roleId)) pendingBoards.set(roleId, boards);
    return;
  }
  if (!response.ok) {
    if (!pendingBoards.has(roleId)) pendingBoards.set(roleId, boards);
    return;
  }
  if (pendingBoards.has(roleId)) return;
  savedBoardJson.set(roleId, json);
  forgetLegacyBoards(roleId);
}

function nodeDraft(node: CanvasNode): {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  body: string;
  url: string;
  achievementId?: string;
} {
  return {
    id: node.id,
    kind: isCanvasNodeKind(node.kind) ? node.kind : "Design",
    title: node.title,
    body: node.body,
    url: node.url,
    achievementId: node.achievementId,
  };
}

type Frame = { left: number; top: number; width: number; height: number };

function mapFrame(): Frame {
  const stage = document.querySelector(".work-map-stage")?.getBoundingClientRect();
  const inset = 8;
  if (stage && stage.width > 80 && stage.height > 80) {
    const column = document.querySelector(".work-map-float")?.getBoundingClientRect();
    let left = stage.left + inset;
    let width = stage.width - inset * 2;
    if (column && column.right > left && column.left < stage.right - 280) {
      left = column.right + inset;
      width = Math.max(280, stage.right - inset - left);
    }
    return {
      left,
      top: stage.top + inset,
      width,
      height: Math.max(180, stage.height - inset * 2),
    };
  }
  const barBottom = document.querySelector(".home-bar")?.getBoundingClientRect().bottom ?? 56;
  const top = Math.ceil(barBottom + 8);
  return {
    left: 8,
    top,
    width: Math.max(280, window.innerWidth - 16),
    height: Math.max(180, window.innerHeight - top - 8),
  };
}

type Viewer = { title: string; url: string; kind: string } | null;

export function RoleCanvasEntry({
  role,
  roles,
  scope = "role",
  minimized,
  slot,
  dockSlot,
  onMinimizedChange,
  onShowRole,
  onOpenRole,
  onClose,
}: {
  role: WorkMapRole;
  roles?: WorkMapRole[];
  scope?: "role" | "all";
  minimized: boolean;
  slot: HTMLElement | null;
  dockSlot: HTMLElement | null;
  onMinimizedChange: (minimized: boolean) => void;
  onShowRole: () => void;
  onOpenRole?: (role: WorkMapRole) => void;
  onClose: () => void;
}) {
  const catalog = useMemo(
    () => (scope === "all" ? (roles ?? []) : [role]),
    [scope, role, roles],
  );
  const openingId = scope === "all" ? (catalog[0]?.id ?? role.id) : role.id;
  const openingViewport = readViewport(scope === "all" ? openingId : role.id, openingId);
  const [boards, setBoards] = useState(() =>
    scope === "all" ? loadAllBoards(catalog) : reflectRole(loadBoards(role), role),
  );
  const [canvasId, setCanvasId] = useState(openingId);
  const [boardKind, setBoardKind] = useState<"all" | CareerHistorySectionKey>("all");
  const [boardRoleId, setBoardRoleId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ kind: "node" | "group"; id: string; x: number; y: number } | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);
  const [menuEpoch, setMenuEpoch] = useState(0);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(openingViewport?.zoom ?? 1);
  const [railOpen, setRailOpen] = useState(true);
  const [boardQuery, setBoardQuery] = useState("");
  const [titleOpen, setTitleOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [note, setNote] = useState("");
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [mapOpen, setMapOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [snaps, setSnaps] = useState(readSnaps);
  const [wireMenu, setWireMenu] = useState<{ fromId: string; toId: string; x: number; y: number } | null>(null);
  const [hotWire, setHotWire] = useState<string | null>(null);
  const [relationPrompt, setRelationPrompt] = useState<{
    fromId: string;
    toId: string;
    x: number;
    y: number;
    mode: "create" | "edit";
    value: string;
  } | null>(null);
  const [draftWire, setDraftWire] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [hotTarget, setHotTarget] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const chromeRef = useRef<Chrome>(EMPTY_CHROME);
  const pendingScroll = useRef<{ left: number; top: number } | null>(
    openingViewport ? { left: openingViewport.x, top: openingViewport.y } : null,
  );
  const panPadRef = useRef(0);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [view, setView] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [zoomPos, setZoomPos] = useState<{ left: number; top: number } | null>(null);
  const [mapBelow, setMapBelow] = useState(false);
  const zoomClusterRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    id: string | null;
    kind: CanvasNodeKind;
    title: string;
    body: string;
    url: string;
    achievementId?: string;
  } | null>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(288);
  const [nodeError, setNodeError] = useState("");

  useEffect(() => {
    if (!draft) setPanelPos(null);
  }, [draft]);
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const restoreFrame = useRef<Frame | null>(null);
  const undoRef = useRef<BoardSnap[]>([]);
  const redoRef = useRef<BoardSnap[]>([]);
  const copiedRef = useRef<CanvasNode[]>([]);
  const commandRef = useRef<CanvasCommands | null>(null);

  useEffect(() => {
    if (!historyOpen && !wireMenu && !nodeMenu && !canvasMenu && !relationPrompt && !titleOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".role-canvas-title-menu, .role-canvas-title")) setTitleOpen(false);
      if (!target?.closest(".role-canvas-history-panel, .role-canvas-history, .role-canvas-save")) {
        setHistoryOpen(false);
      }
      if (!target?.closest(".role-canvas-context, .role-canvas-relation")) {
        setWireMenu(null);
        setNodeMenu(null);
        setCanvasMenu(null);
      }
      if (!target?.closest(".role-canvas-relation")) setRelationPrompt(null);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [historyOpen, wireMenu, nodeMenu, canvasMenu, relationPrompt, titleOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(SNAP_KEY, JSON.stringify(snaps));
    } catch {
      /* storage can be unavailable */
    }
  }, [snaps]);

  useEffect(() => {
    if (!open || !maximized) return;
    const place = () => setFrame(mapFrame());
    place();
    const stage = document.querySelector(".work-map-stage");
    const observer = new ResizeObserver(place);
    if (stage) observer.observe(stage);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open, maximized]);

  useEffect(() => {
    if (scope === "all") {
      setBoards((current) => catalog.reduce((next, item) => reflectRole(next, item), current));
      return;
    }
    setBoards((current) => reflectRole(current, role));
    setDraft((current) => {
      if (!current?.achievementId) return current;
      const statement = achievementStatement(role.achievements, role.achievementIds, current.achievementId);
      if (!statement || current.title === statement) return current;
      return { ...current, title: statement };
    });
  }, [role, scope, catalog]);

  const canvas = boards.find((board) => board.id === canvasId) ?? boards[0];
  const selected = canvas?.nodes.find((node) => node.id === selectedId) ?? null;
  const focusRole = scope === "all" ? (catalog.find((item) => item.id === canvas?.id) ?? null) : role;
  const roleBoard = boards.find((board) => board.id === (focusRole?.id ?? role.id));
  const linkedIds = new Set<string>();
  for (const node of roleBoard?.nodes ?? []) {
    for (const link of node.links) {
      if (!link.id || link.id === node.id) continue;
      linkedIds.add(node.id);
      linkedIds.add(link.id);
    }
  }
  const linked = roleBoard?.nodes.filter((node) => node.id !== "role" && linkedIds.has(node.id)) ?? [];
  const achievementRefs = (focusRole?.achievements ?? []).flatMap((line, index) => {
    const statement = line.trim();
    if (!statement) return [];
    return [{ id: focusRole?.achievementIds?.[index] ?? "", statement }];
  });
  const boardsRef = useRef(boards);
  boardsRef.current = boards;

  useEffect(() => {
    if (scope === "all") {
      for (const item of catalog) {
        const own = boards.find((board) => board.id === item.id);
        if (!own) continue;
        const stored = readStoredBoards(item) ?? boardsForRole(item);
        const next = stored.some((board) => board.id === own.id)
          ? stored.map((board) => (board.id === own.id ? own : board))
          : [own, ...stored];
        if (JSON.stringify(stored) !== JSON.stringify(next)) scheduleVaultSave(item.id, next);
      }
      return;
    }
    if (!boards.some((board) => board.id === role.id)) return;
    scheduleVaultSave(role.id, boards);
  }, [boards, role.id, scope, catalog]);

  useEffect(() => {
    if (!open || minimized) return;
    function onKey(event: KeyboardEvent) {
      const commands = commandRef.current;
      if (!commands) return;
      if (event.key === "Escape") {
        commands.closeMenus();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z" && !event.shiftKey) {
        event.preventDefault();
        commands.undo();
        return;
      }
      if (mod && (key === "y" || (key === "z" && event.shiftKey))) {
        event.preventDefault();
        commands.redo();
        return;
      }
      if (mod && key === "a") {
        event.preventDefault();
        commands.selectAll();
        return;
      }
      if (mod && key === "v") {
        event.preventDefault();
        commands.pasteCenter();
        return;
      }
      if (mod && key === "c") {
        event.preventDefault();
        commands.copy();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        commands.duplicate();
        return;
      }
      if (mod && event.key === "]") {
        event.preventDefault();
        commands.restackFront();
        return;
      }
      if (mod && event.key === "[") {
        event.preventDefault();
        commands.restackBack();
        return;
      }
      if (mod && key === "l") {
        event.preventDefault();
        commands.toggleLock();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        commands.deleteSelection();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, minimized]);

  function commitUndo(before: BoardSnap) {
    undoRef.current.push(before);
    if (undoRef.current.length > 60) undoRef.current.shift();
    redoRef.current = [];
    setMenuEpoch((value) => value + 1);
  }

  function remember() {
    const board = boardsRef.current.find((item) => item.id === canvas?.id);
    if (!board) return;
    commitUndo(cloneBoard(board));
  }

  function closeMenus() {
    setNodeMenu(null);
    setCanvasMenu(null);
    setWireMenu(null);
    setTitleOpen(false);
  }

  function applyBoardSnap(snap: BoardSnap) {
    setBoards((current) =>
      current.map((board) =>
        board.id === snap.boardId ? { ...board, nodes: snap.nodes, groups: snap.groups } : board,
      ),
    );
    setGuides([]);
    closeMenus();
    if (snap.boardId !== canvas?.id) return;
    const ids = new Set(snap.nodes.map((node) => node.id));
    setSelection((current) => current.filter((id) => ids.has(id)));
    setDraft((current) => {
      if (!current?.id || !ids.has(current.id)) return null;
      const node = snap.nodes.find((item) => item.id === current.id);
      if (!node) return null;
      return {
        id: node.id,
        kind: isCanvasNodeKind(node.kind) ? node.kind : "Design",
        title: node.title,
        body: node.body,
        url: node.url,
        achievementId: node.achievementId,
      };
    });
    setSelectedId((current) => (current && ids.has(current) ? current : null));
  }

  function undo() {
    const snap = undoRef.current.pop();
    if (!snap) return;
    const board = boardsRef.current.find((item) => item.id === snap.boardId);
    if (board) redoRef.current.push(cloneBoard(board));
    applyBoardSnap(snap);
    setMenuEpoch((value) => value + 1);
  }

  function redo() {
    const snap = redoRef.current.pop();
    if (!snap) return;
    const board = boardsRef.current.find((item) => item.id === snap.boardId);
    if (board) {
      undoRef.current.push(cloneBoard(board));
      if (undoRef.current.length > 60) undoRef.current.shift();
    }
    applyBoardSnap(snap);
    setMenuEpoch((value) => value + 1);
  }

  useEffect(() => {
    if (!selectedId) return;
    const node = boardsRef.current.flatMap((board) => board.nodes).find((item) => item.id === selectedId);
    if (!node) return;
    setDraft(nodeDraft(node));
    setNodeError("");
  }, [selectedId]);

  function patchNode(id: string, patch: Partial<CanvasNode>) {
    setBoards((current) =>
      current.map((board) => ({
        ...board,
        nodes: board.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      })),
    );
  }

  function viewOwner(boardId: string) {
    if (scope !== "all") return role.id;
    return catalog.some((item) => item.id === boardId) ? boardId : "all";
  }

  function showHome(nextId: string) {
    rememberViewport();
    const saved = readViewport(viewOwner(nextId), nextId);
    chromeRef.current = EMPTY_CHROME;
    pendingScroll.current = { left: saved?.x ?? 0, top: saved?.y ?? 0 };
    setZoom(saved?.zoom ?? 1);
    if (nextId !== canvasId) {
      setDraft(null);
      setNodeError("");
    }
    setCanvasId(nextId);
    setSelectedId(null);
    setLinkOpen(false);
    setTitleOpen(false);
  }

  function showRoleBoards(item: WorkMapRole) {
    setBoardRoleId(item.id);
    if (canvasId !== item.id) showHome(item.id);
  }

  function openMainBoard(item: WorkMapRole) {
    if (boardRoleId === item.id) {
      setBoardRoleId(null);
      return;
    }
    showRoleBoards(item);
  }

  function chooseKind(next: "all" | CareerHistorySectionKey) {
    if (next !== "all" && next === boardKind && boardRoleId) {
      setBoardRoleId(null);
      return;
    }
    setBoardKind(next);
    if (next === "all") return;
    const sectionRoles = catalog.filter((item) => classifyCareerHistorySection(item) === next);
    const current =
      catalog.find((item) => item.id === canvasId) ??
      catalog.find((item) => item.id === boardRoleId);
    const match = sectionRoles.find((item) => item.id === current?.id) ?? sectionRoles[0];
    if (match) openMainBoard(match);
  }

  function openCanvas(nodeId: string | null) {
    setOpen(true);
    if (minimized) onMinimizedChange(false);
    setSelectedId(nodeId);
    setLinkOpen(false);
  }

  function closeCanvas() {
    rememberViewport();
    setSelectedId(null);
    setMaximized(false);
    setLinkOpen(false);
    onMinimizedChange(false);
    onClose();
  }

  function openViewer(node: CanvasNode) {
    if (!node.url) return;
    setViewer({ title: node.title, url: node.url, kind: node.kind });
  }

  function onLinked(node: CanvasNode) {
    if (scope !== "all" && canvasId !== role.id) showHome(role.id);
    if (node.kind === "Video" || node.kind === "Photo") {
      openViewer(node);
      return;
    }
    openCanvas(node.id);
  }

  useLayoutEffect(() => {
    const plane = planeRef.current;
    const stage = stageRef.current;
    if (!plane || !stage) return;
    const board = plane;
    const frame = stage;
    board.style.transform = `scale(${zoom})`;
    function place() {
      if (frame.clientWidth < 1 || frame.clientHeight < 1) return;
      const inset = chromeRef.current;
      const slack = Math.max(frame.clientWidth, frame.clientHeight);
      board.style.marginTop = `${inset.top + slack}px`;
      board.style.marginLeft = `${inset.left + slack}px`;
      board.style.marginRight = `${Math.max(0, board.offsetWidth * (zoom - 1)) + inset.extraRight + slack}px`;
      board.style.marginBottom = `${Math.max(0, board.offsetHeight * (zoom - 1)) + inset.bottom + slack}px`;
      if (pendingScroll.current) {
        frame.scrollLeft = pendingScroll.current.left + slack;
        frame.scrollTop = pendingScroll.current.top + slack;
        pendingScroll.current = null;
      } else if (panPadRef.current !== slack) {
        frame.scrollLeft += slack - panPadRef.current;
        frame.scrollTop += slack - panPadRef.current;
      }
      panPadRef.current = slack;
      setView({
        left: frame.scrollLeft - (inset.left + slack),
        top: frame.scrollTop - (inset.top + slack),
        width: frame.clientWidth,
        height: frame.clientHeight,
      });
    }
    place();
    const observer = new ResizeObserver(() => place());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [zoom, canvas, open, minimized]);

  const wires = useWires(canvas, open && !minimized, zoom, selectedId);

  function readFrame(): Frame {
    const rect = windowRef.current?.getBoundingClientRect();
    if (frame) return frame;
    return {
      left: rect?.left ?? 24,
      top: rect?.top ?? 76,
      width: rect?.width ?? 672,
      height: rect?.height ?? 480,
    };
  }

  useEffect(() => {
    const cluster = zoomClusterRef.current;
    if (!cluster || !mapOpen) return;
    const host = cluster.offsetParent instanceof HTMLElement ? cluster.offsetParent : null;
    const map = cluster.querySelector<HTMLElement>(".role-canvas-minimap");
    if (!host || !map) return;
    const roomAbove = cluster.offsetTop;
    const roomBelow = host.clientHeight - cluster.offsetTop - cluster.offsetHeight;
    setMapBelow(roomAbove < map.offsetHeight + 8 && roomBelow > roomAbove);
  }, [mapOpen, zoomPos]);

  function dragZoom(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    const cluster = event.currentTarget.parentElement;
    if (!cluster) return;
    event.preventDefault();
    const originLeft = cluster.offsetLeft;
    const originTop = cluster.offsetTop;
    const startX = event.clientX;
    const startY = event.clientY;
    const bar = event.currentTarget;
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const host = cluster.offsetParent instanceof HTMLElement ? cluster.offsetParent : null;
      const maxLeft = Math.max(8, (host?.clientWidth ?? 320) - cluster.offsetWidth - 8);
      const maxTop = Math.max(8, (host?.clientHeight ?? 240) - cluster.offsetHeight - 8);
      setZoomPos({
        left: Math.min(Math.max(8, originLeft + next.clientX - startX), maxLeft),
        top: Math.min(Math.max(8, originTop + next.clientY - startY), maxTop),
      });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    }
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  }

  function dragPanel(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, textarea, select, a, .role-canvas-controls-resize")) return;
    const panel = event.currentTarget;
    const host = windowRef.current;
    if (!host) return;
    const hostBox = host.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const originLeft = box.left - hostBox.left;
    const originTop = box.top - hostBox.top;
    const startX = event.clientX;
    const startY = event.clientY;
    const width = box.width;
    let dragging = false;
    let place: { left: number; top: number } | null = null;
    try {
      panel.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      if (!dragging) {
        if ((next.clientX - startX) ** 2 + (next.clientY - startY) ** 2 < 16) return;
        dragging = true;
      }
      const maxLeft = Math.max(8, host.clientWidth - width - 8);
      const maxTop = Math.max(40, host.clientHeight - 48);
      place = {
        left: Math.min(Math.max(8, originLeft + next.clientX - startX), maxLeft),
        top: Math.min(Math.max(40, originTop + next.clientY - startY), maxTop),
      };
      setPanelPos(place);
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      panel.removeEventListener("pointermove", move);
      panel.removeEventListener("pointerup", up);
      panel.removeEventListener("pointercancel", up);
      if (!dragging || !place) return;
      const gap = host.clientWidth - (place.left + width);
      if (gap <= 80) setPanelPos(null);
    }
    panel.addEventListener("pointermove", move);
    panel.addEventListener("pointerup", up);
    panel.addEventListener("pointercancel", up);
  }

  function resizePanel(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const host = windowRef.current;
    const panel = event.currentTarget.parentElement;
    if (!host || !panel) return;
    const hostBox = host.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const originWidth = box.width;
    const originLeft = box.left - hostBox.left;
    const originTop = panelPos?.top ?? box.top - hostBox.top;
    const floating = panelPos !== null;
    const startX = event.clientX;
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const max = Math.max(240, Math.min(host.clientWidth - 48, host.clientWidth * 0.62));
      const width = Math.round(Math.min(max, Math.max(240, originWidth - (next.clientX - startX))));
      setPanelWidth(width);
      if (!floating) return;
      setPanelPos({
        left: Math.min(Math.max(8, originLeft + originWidth - width), Math.max(8, host.clientWidth - width - 8)),
        top: originTop,
      });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || maximized || minimized) return;
    if ((event.target as HTMLElement).closest("button, input, .role-canvas-history-panel")) return;
    event.preventDefault();
    const origin = readFrame();
    const startX = event.clientX;
    const startY = event.clientY;
    const bar = event.currentTarget;
    try {
      bar.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const left = Math.min(Math.max(8, origin.left + next.clientX - startX), window.innerWidth - 48);
      const top = Math.min(Math.max(8, origin.top + next.clientY - startY), window.innerHeight - 36);
      setFrame({ ...origin, left, top });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    }
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  }

  function resizeWindow(event: ReactPointerEvent<HTMLElement>, edge: string) {
    if (event.button !== 0 || maximized || minimized) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = readFrame();
    const startX = event.clientX;
    const startY = event.clientY;
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      let width = origin.width;
      let height = origin.height;
      if (edge.includes("e")) width = origin.width + dx;
      if (edge.includes("s")) height = origin.height + dy;
      if (edge.includes("w")) width = origin.width - dx;
      if (edge.includes("n")) height = origin.height - dy;
      width = Math.min(window.innerWidth - 16, Math.max(280, width));
      height = Math.min(window.innerHeight - 16, Math.max(180, height));
      let left = edge.includes("w") ? origin.left + origin.width - width : origin.left;
      let top = edge.includes("n") ? origin.top + origin.height - height : origin.top;
      left = Math.min(Math.max(8, left), window.innerWidth - 48);
      top = Math.min(Math.max(8, top), window.innerHeight - 36);
      setFrame({ left, top, width, height });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  }

  function toggleMinimize() {
    if (!minimized) {
      rememberViewport();
      if (!maximized) {
        const current = readFrame();
        restoreFrame.current = current;
        setFrame(current);
      }
      setMaximized(false);
      onMinimizedChange(true);
      return;
    }
    onMinimizedChange(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  function toggleMaximize() {
    const current = readFrame();
    if (!maximized) {
      restoreFrame.current = current;
      setFrame(mapFrame());
      setMaximized(true);
      onMinimizedChange(false);
      return;
    }
    setMaximized(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  function dragNode(event: ReactPointerEvent<HTMLElement>, node: CanvasNode) {
    if (tool === "pan" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, textarea")) return;
    const board = boardsRef.current.find((item) => item.id === canvas?.id);
    if (!board) return;
    const boardId = board.id;
    const moving = selection.includes(node.id)
      ? board.nodes.filter((item) => selection.includes(item.id))
      : [node];
    const origins = new Map(moving.map((item) => [item.id, { x: item.x, y: item.y }]));
    const before = cloneBoard(board);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const card = event.currentTarget;
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = (next.clientX - startX) / zoom;
      const dy = (next.clientY - startY) / zoom;
      if (!moved && dx * dx + dy * dy < 16 / (zoom * zoom)) return;
      moved = true;
      if (node.locked) return;
      const placed = new Map(
        [...origins].flatMap(([id, from]) => {
          const item = moving.find((entry) => entry.id === id);
          if (item?.locked) return [];
          return [[id, { x: Math.max(8, from.x + dx), y: Math.max(8, from.y + dy) }]] as const;
        }),
      );
      const snapped = alignDrag(card, placed.get(node.id) ?? { x: node.x, y: node.y }, new Set(moving.map((item) => item.id)));
      const anchor = placed.get(node.id) ?? { x: node.x, y: node.y };
      const fixX = snapped.x - anchor.x;
      const fixY = snapped.y - anchor.y;
      setGuides(snapped.lines);
      setBoards((current) =>
        current.map((item) => {
          if (item.id !== boardId) return item;
          return {
            ...item,
            nodes: item.nodes.map((entry) => {
              const next = placed.get(entry.id);
              if (!next) return entry;
              return { ...entry, x: Math.max(8, next.x + fixX), y: Math.max(8, next.y + fixY) };
            }),
          };
        }),
      );
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", up);
      setGuides([]);
      if (moved) {
        if (!node.locked) commitUndo(before);
        return;
      }
      setSelectedGroupId(null);
      setLinkOpen(false);
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        setSelection((current) => {
          const next = current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id];
          if (next.length === 1) setSelectedId(next[0]);
          else {
            setSelectedId(null);
            setDraft(null);
          }
          return next;
        });
        return;
      }
      setSelection([node.id]);
      setSelectedId(node.id);
    }
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
  }

  function dragGroup(event: ReactPointerEvent<HTMLElement>, group: CanvasGroup) {
    if (tool === "pan" || event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    const board = boardsRef.current.find((item) => item.id === canvas?.id);
    if (!board) return;
    const boardId = board.id;
    const members = board.nodes.filter((node) => group.members.includes(node.id));
    const origins = new Map(members.map((item) => [item.id, { x: item.x, y: item.y }]));
    const origin = { x: group.x, y: group.y };
    const before = cloneBoard(board);
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const card = event.currentTarget;
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = (next.clientX - startX) / zoom;
      const dy = (next.clientY - startY) / zoom;
      if (!moved && dx * dx + dy * dy < 16 / (zoom * zoom)) return;
      moved = true;
      const raw = { x: Math.max(8, origin.x + dx), y: Math.max(8, origin.y + dy) };
      const snapped = alignDrag(card, raw, new Set([group.id]));
      setGuides(snapped.lines);
      setBoards((current) =>
        current.map((item) => {
          if (item.id !== boardId) return item;
          return {
            ...item,
            groups: item.groups.map((entry) =>
              entry.id === group.id ? { ...entry, x: snapped.x, y: snapped.y } : entry,
            ),
            nodes: item.nodes.map((entry) => {
              const from = origins.get(entry.id);
              if (!from) return entry;
              return {
                ...entry,
                x: Math.max(8, from.x + (snapped.x - origin.x)),
                y: Math.max(8, from.y + (snapped.y - origin.y)),
              };
            }),
          };
        }),
      );
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", up);
      setGuides([]);
      if (moved) {
        commitUndo(before);
        return;
      }
      setSelection([]);
      setSelectedId(null);
      setDraft(null);
      setSelectedGroupId(group.id);
    }
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
  }

  function alignDrag(
    card: HTMLElement,
    point: { x: number; y: number },
    movingIds: Set<string>,
  ): { x: number; y: number; lines: GuideLine[] } {
    const plane = planeRef.current;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const snap = 8;
    let x = point.x;
    let y = point.y;
    if (!plane) return { x: Math.max(8, x), y: Math.max(8, y), lines: [] };
    const others = [...plane.querySelectorAll<HTMLElement>(".role-canvas-node")].flatMap((el) => {
      const id = el.dataset.id || el.dataset.group || "";
      if (movingIds.has(id)) return [];
      const box = boxForCard(el);
      return box ? [box] : [];
    });
    let bestX: { dist: number; target: number; offset: number; other: { x: number; y: number; w: number; h: number } } | null = null;
    let bestY: { dist: number; target: number; offset: number; other: { x: number; y: number; w: number; h: number } } | null = null;
    for (const other of others) {
      const xEdges: Array<[number, number]> = [[x, 0], [x + width / 2, width / 2], [x + width, width]];
      const yEdges: Array<[number, number]> = [[y, 0], [y + height / 2, height / 2], [y + height, height]];
      for (const [edge, offset] of xEdges) {
        for (const target of [other.x, other.x + other.w / 2, other.x + other.w]) {
          const dist = Math.abs(edge - target);
          if (dist <= snap && (!bestX || dist < bestX.dist)) bestX = { dist, target, offset, other };
        }
      }
      for (const [edge, offset] of yEdges) {
        for (const target of [other.y, other.y + other.h / 2, other.y + other.h]) {
          const dist = Math.abs(edge - target);
          if (dist <= snap && (!bestY || dist < bestY.dist)) bestY = { dist, target, offset, other };
        }
      }
    }
    const lines: GuideLine[] = [];
    if (bestX) {
      x = bestX.target - bestX.offset;
      lines.push({
        x1: bestX.target,
        y1: Math.min(y, bestX.other.y),
        x2: bestX.target,
        y2: Math.max(y + height, bestX.other.y + bestX.other.h),
      });
    }
    if (bestY) {
      y = bestY.target - bestY.offset;
      lines.push({
        x1: Math.min(x, bestY.other.x),
        y1: bestY.target,
        x2: Math.max(x + width, bestY.other.x + bestY.other.w),
        y2: bestY.target,
      });
    }
    return { x: Math.max(8, x), y: Math.max(8, y), lines };
  }

  function boxForCard(card: HTMLElement) {
    const board = boardsRef.current.find((item) => item.id === canvas?.id);
    if (!board) return null;
    if (card.dataset.group) {
      const group = board.groups.find((item) => item.id === card.dataset.group);
      return group
        ? { id: group.id, x: group.x, y: group.y, w: card.offsetWidth, h: card.offsetHeight }
        : null;
    }
    const node = board.nodes.find((item) => item.id === card.dataset.id);
    return node ? { id: node.id, x: node.x, y: node.y, w: card.offsetWidth, h: card.offsetHeight } : null;
  }

  function makeGroup() {
    if (!canvas || selection.length < 2) return;
    const name = window.prompt("Name this group", "Group");
    if (name === null) return;
    const members = [...selection];
    const cards = canvas.nodes.filter((node) => members.includes(node.id));
    if (cards.length < 2) return;
    remember();
    const group: CanvasGroup = {
      id: `group-${Date.now()}`,
      name: name.trim() || "Group",
      members,
      collapsed: true,
      x: Math.min(...cards.map((item) => item.x)),
      y: Math.min(...cards.map((item) => item.y)),
    };
    const taken = new Set(members);
    setBoards((current) =>
      current.map((board) => {
        if (board.id !== canvas.id) return board;
        const groups = board.groups.flatMap((item) => {
          const rest = item.members.filter((id) => !taken.has(id));
          return rest.length > 1 ? [{ ...item, members: rest }] : [];
        });
        return { ...board, groups: [...groups, group] };
      }),
    );
    setSelection([]);
    setSelectedId(null);
    setDraft(null);
    setSelectedGroupId(group.id);
    setNodeMenu(null);
  }

  function setGroupCollapsed(group: CanvasGroup, collapsed: boolean) {
    if (!canvas) return;
    remember();
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id
          ? { ...board, groups: board.groups.map((item) => (item.id === group.id ? { ...item, collapsed } : item)) }
          : board,
      ),
    );
    setSelectedGroupId(group.id);
    setSelectedId(null);
    setDraft(null);
    setNodeMenu(null);
  }

  function ungroup(groupId: string) {
    if (!canvas) return;
    remember();
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id ? { ...board, groups: board.groups.filter((item) => item.id !== groupId) } : board,
      ),
    );
    setSelectedGroupId(null);
    setNodeMenu(null);
  }

  function changeZoom(next: number) {
    chromeRef.current = EMPTY_CHROME;
    pendingScroll.current = null;
    setZoom(clampZoom(next));
  }

  function bottomReserve(stage: HTMLElement) {
    const host = stage.closest(".role-canvas");
    const stageBox = stage.getBoundingClientRect();
    let reserve = 16;
    host?.querySelectorAll(".role-canvas-zoom, .role-canvas-drawer").forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.bottom <= stageBox.top || box.top >= stageBox.bottom) return;
      reserve = Math.max(reserve, stageBox.bottom - box.top + 12);
    });
    return reserve;
  }

  function fit() {
    const stage = stageRef.current;
    if (!stage || !canvas || canvas.nodes.length === 0) return;
    const edge = 10;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;
    const hidden = hiddenMemberIds(canvas.groups);
    for (const node of canvas.nodes) {
      if (hidden.has(node.id)) continue;
      const el = stage.querySelector<HTMLElement>(`[data-id="${CSS.escape(node.id)}"]`);
      const width = el && el.offsetWidth > 1 ? el.offsetWidth : node.w || 208;
      const height = el && el.offsetHeight > 1 ? el.offsetHeight : node.h || 96;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
    for (const group of canvas.groups) {
      const el = stage.querySelector<HTMLElement>(`[data-group="${CSS.escape(group.id)}"]`);
      const width = el && el.offsetWidth > 1 ? el.offsetWidth : 208;
      const height = el && el.offsetHeight > 1 ? el.offsetHeight : 96;
      const x = group.collapsed ? group.x : Math.max(8, group.x - 28);
      minX = Math.min(minX, x);
      minY = Math.min(minY, group.y);
      maxX = Math.max(maxX, x + width);
      maxY = Math.max(maxY, group.y + height);
    }
    minX -= edge;
    minY -= edge;
    maxX += edge;
    maxY += edge;
    const spanW = Math.max(1, maxX - minX);
    const spanH = Math.max(1, maxY - minY);
    const pad = 28;
    const reserve = bottomReserve(stage);
    const roomW = Math.max(160, stage.clientWidth - pad * 2);
    const roomH = Math.max(120, stage.clientHeight - reserve - pad);
    const placed = Math.min(2.5, Math.max(0.05, Math.min(roomW / spanW, roomH / spanH)));
    const contentW = spanW * placed;
    const contentH = spanH * placed;
    const leftGap = Math.max(pad, (stage.clientWidth - contentW) / 2);
    const topRoom = Math.max(pad, stage.clientHeight - reserve);
    const topGap = Math.max(pad, (topRoom - contentH) / 2);
    const shiftX = minX * placed;
    chromeRef.current = {
      left: Math.max(0, leftGap - shiftX),
      top: Math.max(0, topGap - minY * placed),
      bottom: reserve,
      extraRight: Math.max(0, shiftX - leftGap),
    };
    pendingScroll.current = {
      left: chromeRef.current.extraRight,
      top: Math.max(0, minY * placed - topGap),
    };
    setZoom(placed);
  }

  function snapKey(boardId = canvas?.id ?? "") {
    return `${role.id}:${boardId}`;
  }

  function savesFor(boardId = canvas?.id ?? "") {
    return snaps[snapKey(boardId)] ?? [];
  }

  function saveCanvas() {
    if (!canvas) return;
    const list = savesFor(canvas.id);
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const taken = list.some((item) => item.name === time || String(item.name).startsWith(`${time} ·`));
    const name = taken ? `${time} · ${list.filter((item) => String(item.name).startsWith(time)).length + 1}` : time;
    const snap: Snap = {
      id: `save-${Date.now()}`,
      name,
      at: Date.now(),
      nodes: JSON.parse(JSON.stringify(canvas.nodes)) as CanvasNode[],
      groups: JSON.parse(JSON.stringify(canvas.groups)) as CanvasGroup[],
    };
    setSnaps((current) => ({ ...current, [snapKey(canvas.id)]: [snap, ...list].slice(0, 30) }));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
    setHistoryOpen(true);
  }

  function restoreSnap(snap: Snap) {
    if (!canvas) return;
    const nodes = JSON.parse(JSON.stringify(snap.nodes)) as CanvasNode[];
    const groups = JSON.parse(JSON.stringify(snap.groups ?? [])) as CanvasGroup[];
    setBoards((current) => current.map((board) => (board.id === canvas.id ? { ...board, nodes, groups } : board)));
    setSelectedId(nodes[0]?.id ?? null);
    setDraft(null);
    setLinkOpen(false);
    window.setTimeout(fit, 0);
  }

  function renameSnap(snap: Snap, name: string) {
    const next = name.trim();
    if (!next || !canvas) return;
    setSnaps((current) => ({
      ...current,
      [snapKey(canvas.id)]: (current[snapKey(canvas.id)] ?? []).map((item) =>
        item.id === snap.id ? { ...item, name: next } : item,
      ),
    }));
  }

  function removeSnap(id: string) {
    if (!canvas) return;
    setSnaps((current) => ({
      ...current,
      [snapKey(canvas.id)]: (current[snapKey(canvas.id)] ?? []).filter((item) => item.id !== id),
    }));
  }

  function removeLink(fromId: string, toId: string) {
    if (!canvas) return;
    const from = canvas.nodes.find((node) => node.id === fromId);
    if (!from) return;
    remember();
    const boardId = canvas.id;
    const links = from.links.filter((link) => link.id !== toId);
    setBoards((current) =>
      current.map((board) =>
        board.id === boardId
          ? { ...board, nodes: board.nodes.map((node) => (node.id === fromId ? { ...node, links } : node)) }
          : board,
      ),
    );
    setWireMenu(null);
  }

  function targetsFor(id: string) {
    if (!canvas) return [];
    const ids = selection.includes(id) ? selection : [id];
    return canvas.nodes.filter((node) => ids.includes(node.id));
  }

  function focusId() {
    if (selectedId && (selection.length === 0 || selection.includes(selectedId))) return selectedId;
    return selection[0] ?? null;
  }

  function snapshotNode(node: CanvasNode): CanvasNode {
    return {
      id: node.id,
      kind: node.kind,
      title: node.title,
      body: node.body,
      x: node.x,
      y: node.y,
      url: node.url,
      notes: [...node.notes],
      links: node.links.map((link) => ({ ...link })),
      ...(node.w ? { w: node.w } : {}),
      ...(node.h ? { h: node.h } : {}),
    };
  }

  function placeCopies(copies: CanvasNode[]) {
    if (!canvas || copies.length === 0) return;
    const editing = Boolean(selectedId);
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id ? { ...board, nodes: [...board.nodes, ...copies] } : board,
      ),
    );
    setSelection(copies.map((copy) => copy.id));
    setSelectedGroupId(null);
    if (editing && copies.length === 1) setSelectedId(copies[0].id);
    else {
      setSelectedId(null);
      setDraft(null);
    }
    setNodeError("");
    closeMenus();
  }

  function duplicateFrom(id: string) {
    const group = targetsFor(id);
    if (!group.length) return;
    remember();
    const copies = group.map((item, index) => ({
      ...snapshotNode(item),
      id: `copy-${Date.now()}-${index}`,
      x: item.x + 36,
      y: item.y + 36,
    }));
    placeCopies(copies);
  }

  function copyFrom(id: string) {
    const group = targetsFor(id);
    if (!group.length) return;
    copiedRef.current = group.map(snapshotNode);
    const text = group.map((item) => [item.kind, item.title, item.body].filter(Boolean).join("\n")).join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setMenuEpoch((value) => value + 1);
    closeMenus();
  }

  function pasteAt(at: { x: number; y: number }) {
    const items = copiedRef.current;
    if (!items.length) return;
    remember();
    const originX = items[0].x;
    const originY = items[0].y;
    const copies = items.map((item, index) => ({
      ...snapshotNode(item),
      id: `copy-${Date.now()}-${index}`,
      x: Math.max(8, at.x + (item.x - originX)),
      y: Math.max(8, at.y + (item.y - originY)),
    }));
    placeCopies(copies);
  }

  function planeOrigin() {
    const plane = planeRef.current;
    return {
      left: plane ? Number.parseFloat(plane.style.marginLeft) || 0 : 0,
      top: plane ? Number.parseFloat(plane.style.marginTop) || 0 : 0,
    };
  }

  function rememberViewport(boardId = canvasId) {
    const stage = stageRef.current;
    if (!boardId || !stage || stage.clientWidth < 1 || stage.clientHeight < 1) return;
    const origin = planeOrigin();
    writeViewport(viewOwner(boardId), boardId, {
      x: stage.scrollLeft - origin.left,
      y: stage.scrollTop - origin.top,
      zoom,
    });
  }

  useEffect(() => {
    if (!canvasId || minimized) return;
    const boardId = canvasId;
    const timer = window.setTimeout(() => rememberViewport(boardId), 200);
    return () => window.clearTimeout(timer);
  }, [view.left, view.top, zoom, canvasId, minimized]);

  function canvasPoint(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage) return { x: 24, y: 48 };
    const rect = stage.getBoundingClientRect();
    const origin = planeOrigin();
    return {
      x: (clientX - rect.left + stage.scrollLeft - origin.left) / zoom,
      y: (clientY - rect.top + stage.scrollTop - origin.top) / zoom,
    };
  }

  function wireUnder(clientX: number, clientY: number) {
    const paths = planeRef.current?.querySelectorAll<SVGPathElement>(".role-canvas-wires path.hit");
    if (!paths) return null;
    for (const path of paths) {
      const svg = path.ownerSVGElement;
      const ctm = path.getScreenCTM();
      if (!svg || !ctm) continue;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      try {
        if (!path.isPointInStroke(point.matrixTransform(ctm.inverse()))) continue;
      } catch {
        continue;
      }
      const fromId = path.dataset.from;
      const toId = path.dataset.to;
      if (fromId && toId) return { fromId, toId };
    }
    return null;
  }

  function openWireAt(event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) {
    const wire = wireUnder(event.clientX, event.clientY);
    if (!wire) return false;
    event.preventDefault();
    event.stopPropagation();
    setNodeMenu(null);
    setCanvasMenu(null);
    setWireMenu({ fromId: wire.fromId, toId: wire.toId, x: event.clientX, y: event.clientY });
    return true;
  }

  function pasteCenter() {
    const stage = stageRef.current;
    if (!stage) return;
    pasteAt({
      x: (stage.scrollLeft + stage.clientWidth / 2) / zoom - 80,
      y: (stage.scrollTop + stage.clientHeight / 2) / zoom - 36,
    });
  }

  function restack(id: string, toFront: boolean) {
    const group = targetsFor(id);
    if (!group.length || !canvas) return;
    remember();
    const ids = new Set(group.map((item) => item.id));
    setBoards((current) =>
      current.map((board) => {
        if (board.id !== canvas.id) return board;
        const picked = board.nodes.filter((node) => ids.has(node.id));
        const rest = board.nodes.filter((node) => !ids.has(node.id));
        return { ...board, nodes: toFront ? [...rest, ...picked] : [...picked, ...rest] };
      }),
    );
    closeMenus();
  }

  function lockTargets(id: string) {
    const group = targetsFor(id);
    if (!group.length || !canvas) return;
    remember();
    const lock = group.some((item) => !item.locked);
    const ids = new Set(group.map((item) => item.id));
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id
          ? {
              ...board,
              nodes: board.nodes.map((node) => (ids.has(node.id) ? { ...node, locked: lock } : node)),
            }
          : board,
      ),
    );
    closeMenus();
  }

  function unlockAll() {
    if (!canvas?.nodes.some((node) => node.locked)) return;
    remember();
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id
          ? { ...board, nodes: board.nodes.map((node) => ({ ...node, locked: false })) }
          : board,
      ),
    );
    closeMenus();
  }

  function deleteFrom(id: string) {
    const group = targetsFor(id);
    if (!group.length || !canvas) return;
    remember();
    const ids = new Set(group.map((item) => item.id));
    setBoards((current) =>
      current.map((board) => {
        if (board.id !== canvas.id) return board;
        let nodes = board.nodes;
        for (const nodeId of ids) {
          const next = removeCanvasNode(nodes, nodeId);
          if (next) nodes = next;
        }
        const groups = board.groups.flatMap((entry) => {
          const members = entry.members.filter((member) => !ids.has(member));
          return members.length > 1 ? [{ ...entry, members }] : [];
        });
        return { ...board, nodes, groups };
      }),
    );
    setSelection((current) => current.filter((item) => !ids.has(item)));
    if (selectedId && ids.has(selectedId)) {
      setSelectedId(null);
      setDraft(null);
    }
    closeMenus();
  }

  function editNode(id: string) {
    setSelection([id]);
    setSelectedId(id);
    closeMenus();
  }

  function openRelation(fromId: string, toId: string, x: number, y: number, mode: "create" | "edit") {
    const from = canvas?.nodes.find((node) => node.id === fromId);
    const existing = from?.links.find((link) => link.id === toId);
    if (mode === "create" && existing) return;
    if (!from || !canvas?.nodes.some((node) => node.id === toId) || fromId === toId) return;
    closeMenus();
    setLinkOpen(false);
    setRelationPrompt({ fromId, toId, x, y, mode, value: existing?.relation ?? "" });
  }

  function applyRelation(value: string) {
    const prompt = relationPrompt;
    if (!prompt || !canvas) return;
    const relation = value.trim();
    if (!relation) return;
    const from = canvas.nodes.find((node) => node.id === prompt.fromId);
    const to = canvas.nodes.find((node) => node.id === prompt.toId);
    if (!from || !to || from.id === to.id) return;
    const links =
      prompt.mode === "create"
        ? from.links.some((link) => link.id === to.id)
          ? null
          : [...from.links, { key: to.id, id: to.id, label: to.title || to.kind, relation }]
        : from.links.map((link) => (link.id === to.id ? { ...link, relation } : link));
    if (!links) {
      setRelationPrompt(null);
      return;
    }
    remember();
    const boardId = canvas.id;
    setBoards((current) =>
      current.map((board) =>
        board.id === boardId
          ? { ...board, nodes: board.nodes.map((node) => (node.id === from.id ? { ...node, links } : node)) }
          : board,
      ),
    );
    setRelationPrompt(null);
  }

  function startWire(event: ReactPointerEvent<HTMLButtonElement>, node: CanvasNode) {
    if (tool === "pan" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest(".role-canvas-node");
    const origin = () => {
      const live = boardsRef.current.find((board) => board.id === canvas?.id)?.nodes.find((item) => item.id === node.id) ?? node;
      const width = card instanceof HTMLElement ? card.offsetWidth : node.w || 220;
      const height = card instanceof HTMLElement ? card.offsetHeight : node.h || 88;
      return { x1: live.x + width, y1: live.y + height / 2 };
    };
    const start = origin();
    setDraftWire({ ...start, x2: start.x1, y2: start.y1 });
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const point = canvasPoint(next.clientX, next.clientY);
      const from = origin();
      setDraftWire({ ...from, x2: point.x, y2: point.y });
      const hit = document.elementFromPoint(next.clientX, next.clientY);
      const id = hit?.closest(".role-canvas-node")?.getAttribute("data-id") ?? "";
      setHotTarget(id && id !== node.id ? id : null);
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      setDraftWire(null);
      setHotTarget(null);
      const hit = document.elementFromPoint(next.clientX, next.clientY);
      const id = hit?.closest(".role-canvas-node")?.getAttribute("data-id") ?? "";
      if (!id || id === node.id) return;
      openRelation(node.id, id, next.clientX, next.clientY, "create");
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  }

  function beginAdd() {
    setSelectedId(null);
    setLinkOpen(false);
    setNodeError("");
    setDraft({ id: null, kind: "Design", title: "", body: "", url: "" });
  }

  function placeAchievement(achievement: { id: string; statement: string }, targetId?: string) {
    if (!canvas) return;
    const title = achievement.statement.trim();
    if (!title) return;
    const prepared = prepareCanvasNode({ kind: "Design", title, body: "", url: "" });
    if (!prepared.ok) return;
    const target = targetId ? canvas.nodes.find((node) => node.id === targetId) : null;
    if (targetId && !target) return;
    remember();
    const anchor = canvas.nodes[canvas.nodes.length - 1];
    const created: CanvasNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...prepared.value,
      achievementId: achievement.id || undefined,
      x: anchor ? anchor.x + 36 : 24,
      y: anchor ? anchor.y + 36 : 48,
      notes: [],
      links: target
        ? [{ key: target.id, id: target.id, label: target.title || target.kind, relation: "evidence" }]
        : [],
    };
    const boardId = canvas.id;
    setBoards((current) =>
      current.map((board) =>
        board.id === boardId ? { ...board, nodes: [...board.nodes, created] } : board,
      ),
    );
    setDraft({ id: created.id, ...prepared.value, achievementId: created.achievementId });
    setSelectedId(created.id);
    setNodeError("");
    setLinkOpen(false);
  }

  function saveNode() {
    if (!draft || !canvas) return;
    const title = draft.achievementId
      ? achievementStatement(
          focusRole?.achievements ?? [],
          focusRole?.achievementIds,
          draft.achievementId,
        ) ?? draft.title
      : draft.title;
    const prepared = prepareCanvasNode({ ...draft, title });
    if (!prepared.ok) {
      setNodeError(prepared.error === "title-required" ? "A node needs a title." : "Choose a kind.");
      return;
    }
    setNodeError("");
    remember();
    if (draft.id) {
      patchNode(draft.id, prepared.value);
      setDraft({ id: draft.id, ...prepared.value, achievementId: draft.achievementId });
      return;
    }
    const anchor = canvas.nodes[canvas.nodes.length - 1];
    const created: CanvasNode = {
      id: `node-${Date.now()}`,
      ...prepared.value,
      x: anchor ? anchor.x + 36 : 24,
      y: anchor ? anchor.y + 36 : 48,
      notes: [],
      links: [],
    };
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id ? { ...board, nodes: [...board.nodes, created] } : board,
      ),
    );
    setDraft({ id: created.id, ...prepared.value });
    setSelectedId(created.id);
  }

  function removeNode() {
    if (!draft?.id || !canvas) return;
    const next = removeCanvasNode(canvas.nodes, draft.id);
    if (!next) return;
    remember();
    setBoards((current) =>
      current.map((board) => {
        if (board.id !== canvas.id) return board;
        const groups = board.groups.flatMap((group) => {
          const members = group.members.filter((id) => id !== draft.id);
          return members.length > 1 ? [{ ...group, members }] : [];
        });
        return { ...board, nodes: next, groups };
      }),
    );
    setSelectedId(null);
    setDraft(null);
    setNodeError("");
    setLinkOpen(false);
  }

  function jumpSearch() {
    const needle = query.trim().toLowerCase();
    const match = canvas?.nodes.find(
      (node) => !needle || `${node.title} ${node.body}`.toLowerCase().includes(needle),
    );
    if (!match || !stageRef.current) return;
    const origin = planeOrigin();
    stageRef.current.scrollLeft = Math.max(0, match.x * zoom - 24 + origin.left);
    stageRef.current.scrollTop = Math.max(0, match.y * zoom - 24 + origin.top);
    setSelectedId(match.id);
  }

  function addLink(target: CanvasNode) {
    if (!selected) return;
    const key = target.id;
    const already = selected.links.some((link) => link.key === key);
    if (!already) {
      remember();
      patchNode(selected.id, {
        links: [...selected.links, { key, id: target.id, label: target.title || target.kind }],
      });
      setLinkOpen(false);
      return;
    }
    setSelectedId(target.id);
    setLinkOpen(false);
    if (target.kind === "Video" || target.kind === "Photo") openViewer(target);
  }

  function addNote() {
    if (!selected) return;
    const text = note.trim();
    if (!text) return;
    remember();
    patchNode(selected.id, { notes: [...selected.notes, text] });
    setNote("");
  }

  commandRef.current = {
    closeMenus,
    undo,
    redo,
    selectAll: () => {
      const ids = canvas?.nodes.map((node) => node.id) ?? [];
      setSelection(ids);
      setSelectedId(ids[0] ?? null);
      closeMenus();
    },
    pasteCenter,
    copy: () => {
      const id = focusId();
      if (id) copyFrom(id);
    },
    duplicate: () => {
      const id = focusId();
      if (id) duplicateFrom(id);
    },
    restackFront: () => {
      const id = focusId();
      if (id) restack(id, true);
    },
    restackBack: () => {
      const id = focusId();
      if (id) restack(id, false);
    },
    toggleLock: () => {
      const id = focusId();
      if (id) lockTargets(id);
    },
    deleteSelection: () => {
      const id = focusId();
      if (id) deleteFrom(id);
    },
  };

  const geometry =
    minimized || !frame
      ? undefined
      : { left: frame.left, top: frame.top, width: frame.width, height: frame.height };

  const roleFacts = [
    role.organization.trim(),
    formatHistoryPlace({
      organization: role.organization,
      locationLabel: role.locationLabel,
      locations: role.locations.map((location) => ({ address: location.address })),
    }),
    formatHistoryPeriod(role.startDate, role.endDate, role.isCurrent),
  ]
    .filter(Boolean)
    .join(" · ");

  const windowNode = open ? (
    <div
      className={[
        "role-canvas",
        minimized ? "is-minimized" : "",
        draft ? "is-editing" : "",
        panelPos ? "is-panel-free" : "",
        railOpen ? "" : "is-rail-shut",
        maximized ? "is-maximized" : "",
        selected ? "is-focus" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={windowRef}
      role="dialog"
      aria-label="Canvas"
      style={{ ...(geometry ?? {}), "--panel-width": `${panelWidth}px` }}
    >
      {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
        <div
          key={edge}
          className={`resize ${edge}`}
          title="Drag to resize"
          onPointerDown={(event) => resizeWindow(event, edge)}
        />
      ))}
      <div
        className="role-canvas-bar"
        onPointerDown={dragWindow}
        onClick={(event) => {
          if (!minimized || (event.target as HTMLElement).closest("button")) return;
          toggleMinimize();
        }}
      >
        <h2>
          <button
            type="button"
            className="role-canvas-panel-toggle"
            aria-expanded={railOpen}
            aria-label={railOpen ? "Close boards" : "Open boards"}
            onClick={() => setRailOpen((open) => !open)}
          >
            <Icon name={railOpen ? "rail" : "railOff"} />
          </button>
          {scope === "all" ? (
            <span className="role-canvas-title">Career history</span>
          ) : role.title.trim() ? (
            <button
              type="button"
              className="role-canvas-title"
              aria-expanded={titleOpen}
              aria-haspopup="menu"
              onClick={() => {
                if (minimized) return;
                setTitleOpen((value) => !value);
              }}
            >
              {role.title.trim()}
            </button>
          ) : (
            <span className="role-canvas-title">Canvas</span>
          )}
          {titleOpen && role.title.trim() ? (
            <div className="role-canvas-title-menu" role="menu">
              {roleFacts ? <p>{roleFacts}</p> : null}
              <button
                type="button"
                role="menuitem"
                aria-current={canvasId === role.id ? "page" : undefined}
                onClick={() => {
                  setTitleOpen(false);
                  if (canvasId !== role.id) showHome(role.id);
                }}
              >
                This role's board
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setTitleOpen(false);
                  onShowRole();
                }}
              >
                Show on the map
              </button>
            </div>
          ) : null}
        </h2>
        <div className="role-canvas-actions">
          <button
            type="button"
            className={savedFlash ? "role-canvas-save is-saved" : "role-canvas-save"}
            aria-label="Save this canvas"
            onClick={saveCanvas}
          >
            Save
          </button>
          <button
            type="button"
            className="role-canvas-history"
            aria-expanded={historyOpen}
            aria-label="Saved versions"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            History
          </button>
          {historyOpen && canvas ? (
            <div className="role-canvas-history-panel">
              <p className="kicker">{canvas.name}</p>
              <h3>Saves</h3>
              <div className="role-canvas-history-list">
                {savesFor().length === 0 ? <p className="empty">Nothing saved for this canvas yet.</p> : null}
                {savesFor().map((snap) => (
                  <article key={snap.id} className="role-canvas-save-row">
                    {renamingId === snap.id ? (
                      <input
                        aria-label="Save name"
                        defaultValue={snap.name}
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            renameSnap(snap, event.currentTarget.value);
                            setRenamingId(null);
                          } else if (event.key === "Escape") {
                            setRenamingId(null);
                          }
                        }}
                        onBlur={(event) => {
                          renameSnap(snap, event.currentTarget.value);
                          setRenamingId(null);
                        }}
                      />
                    ) : (
                      <strong>{snap.name}</strong>
                    )}
                    <p className="meta">
                      {new Date(snap.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </p>
                    <p className="meta">{snapSummary(snap)}</p>
                    <div className="role-canvas-save-actions">
                      <button type="button" onClick={() => restoreSnap(snap)}>
                        Restore
                      </button>
                      <button type="button" onClick={() => setRenamingId(snap.id)}>
                        Rename
                      </button>
                      <button type="button" className="is-danger" onClick={() => removeSnap(snap.id)}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          <button type="button" aria-pressed={minimized} aria-label={minimized ? "Restore" : "Minimize"} onClick={toggleMinimize}>
            {minimized ? <RestoreIcon /> : <MinIcon />}
          </button>
          <button type="button" aria-pressed={maximized} aria-label={maximized ? "Restore size" : "Maximize"} onClick={toggleMaximize}>
            {maximized ? <RestoreIcon /> : <MaxIcon />}
          </button>
          <button type="button" aria-label="Close" onClick={closeCanvas}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {draft && canvas ? (
        <section
          className={panelPos ? "role-canvas-controls is-free" : "role-canvas-controls"}
          aria-label={draft.id ? `${draft.kind} ${draft.title}` : "New node"}
          style={panelPos ? { left: panelPos.left, top: panelPos.top } : undefined}
          onPointerDown={dragPanel}
        >
          <button
            type="button"
            className="role-canvas-controls-resize"
            aria-label="Resize width"
            aria-valuemin={240}
            aria-valuenow={Math.round(panelWidth)}
            aria-valuemax={560}
            onPointerDown={resizePanel}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const host = windowRef.current;
              const step = event.shiftKey ? 32 : 16;
              const delta = event.key === "ArrowLeft" ? step : -step;
              const max = host ? Math.max(240, Math.min(host.clientWidth - 48, host.clientWidth * 0.62)) : 560;
              const width = Math.round(Math.min(max, Math.max(240, panelWidth + delta)));
              setPanelWidth(width);
              if (!panelPos || !host) return;
              setPanelPos({
                left: Math.min(Math.max(8, panelPos.left + panelWidth - width), Math.max(8, host.clientWidth - width - 8)),
                top: panelPos.top,
              });
            }}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="role-canvas-controls-body">
          <div className="role-canvas-controls-head">
            <button type="button" onClick={() => { setSelectedId(null); setSelection([]); setSelectedGroupId(null); setDraft(null); setNodeError(""); }}>
              Done
            </button>
          </div>
          {!draft.id && achievementRefs.length > 0 ? (
            <div className="role-canvas-suggest" aria-label="Achievements on this role">
              <p>Achievements on this role</p>
              <ul>
                {achievementRefs.map((achievement, index) => (
                  <li key={achievement.id || `${index}-${achievement.statement.slice(0, 24)}`}>
                    <button type="button" onClick={() => placeAchievement(achievement)}>
                      {achievement.statement}
                    </button>
                    {canvas.nodes.length > 0 ? (
                      <label>
                        Link to
                        <select
                          aria-label="Link this achievement to a node"
                          defaultValue=""
                          onChange={(event) => {
                            const targetId = event.target.value;
                            event.target.value = "";
                            if (targetId) placeAchievement(achievement, targetId);
                          }}
                        >
                          <option value="">A node on this board</option>
                          {canvas.nodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.title || node.kind}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <label>
            Kind
            <select
              aria-label="Kind"
              value={draft.kind}
              onChange={(event) => {
                const kind = event.target.value;
                if (!isCanvasNodeKind(kind)) return;
                setDraft({ ...draft, kind });
              }}
            >
              {CANVAS_NODE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input
              aria-label="Title"
              value={draft.title}
              readOnly={Boolean(draft.achievementId)}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Description"
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <label>
            URL
            <input
              aria-label="URL"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            />
          </label>
          <div className="role-canvas-control-row">
            <button type="button" onClick={saveNode}>
              {draft.id ? "Save" : "Add node"}
            </button>
            {draft.id ? (
              <button type="button" onClick={removeNode}>
                Remove
              </button>
            ) : null}
            {draft.id && selected ? (
              <div className="role-canvas-outward">
                <button
                  type="button"
                  aria-expanded={linkOpen}
                  aria-haspopup="menu"
                  onClick={() => setLinkOpen((value) => !value)}
                >
                  Link
                </button>
                {linkOpen ? (
                  <div className="role-canvas-link-menu" role="menu">
                    {canvas.nodes
                      .filter((node) => node.id !== selected.id)
                      .map((node) => {
                        const linkedTo = selected.links.some((link) => link.id === node.id);
                        return (
                          <button
                            key={node.id}
                            type="button"
                            role="menuitem"
                            onClick={(event) => {
                              if (linkedTo) {
                                addLink(node);
                                return;
                              }
                              openRelation(selected.id, node.id, event.clientX, event.clientY, "create");
                            }}
                          >
                            {linkedTo ? `Open ${node.title || node.kind}` : node.title || node.kind}
                          </button>
                        );
                      })}
                    {canvas.nodes.length < 2 ? <p>Nothing else on this canvas yet.</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {draft.id && selected ? (
              <>
                <input
                  aria-label="Note"
                  value={note}
                  placeholder="Note"
                  onChange={(event) => setNote(event.target.value)}
                />
                <button type="button" onClick={addNote}>
                  Add note
                </button>
              </>
            ) : null}
            {selected?.url && (selected.kind === "Video" || selected.kind === "Photo") ? (
              <button type="button" onClick={() => openViewer(selected)}>
                {selected.kind === "Video" ? "Play" : "Open"}
              </button>
            ) : null}
          </div>
          {nodeError ? <p className="role-canvas-node-error">{nodeError}</p> : null}
          </div>
        </section>
      ) : null}
      <div className="role-canvas-body">
      {railOpen ? (
        <aside className="role-canvas-rail" aria-label="Boards">
          <div className="role-canvas-rail-head">
            <strong>Boards</strong>
          </div>
          <div className="role-canvas-rail-find">
            <input
              aria-label="Find a board"
              placeholder="Find a board"
              value={boardQuery}
              onChange={(event) => setBoardQuery(event.target.value)}
            />
            {scope === "all" ? (
              <select
                aria-label="Sort jobs"
                value={boardKind}
                onChange={(event) => chooseKind(event.target.value as "all" | CareerHistorySectionKey)}
              >
                <option value="all">All</option>
                {CAREER_HISTORY_SECTIONS.map((section) => (
                  <option key={section.key} value={section.key}>
                    {section.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="role-canvas-rail-groups">
            {scope === "all" ? (
              <OverviewRail
                roles={catalog}
                boards={boards}
                kind={boardKind}
                query={boardQuery}
                roleId={boardRoleId}
                canvasId={canvasId}
                onKind={chooseKind}
                onRole={openMainBoard}
                onOpenRole={onOpenRole}
                onBoard={showHome}
              />
            ) : (
              boardGroups(boards, role.id, boardQuery).map((group) => (
                <div key={group.label}>
                  <p>{group.label}</p>
                  {group.boards.map((board) => (
                    <button
                      key={board.id}
                      type="button"
                      className={board.id === canvasId ? "is-on" : ""}
                      aria-current={board.id === canvasId ? "page" : undefined}
                      onClick={() => showHome(board.id)}
                    >
                      <span>{board.name}</span>
                      <b>{board.nodes.length}</b>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>
      ) : null}
      <div className="role-canvas-board">
      <div
        className={["role-canvas-stage", tool === "pan" ? "is-pan" : ""].filter(Boolean).join(" ")}
        ref={stageRef}
        onScroll={(event) => {
          const stage = event.currentTarget;
          const origin = planeOrigin();
          setView({
            left: stage.scrollLeft - origin.left,
            top: stage.scrollTop - origin.top,
            width: stage.clientWidth,
            height: stage.clientHeight,
          });
          setNodeMenu(null);
          setCanvasMenu(null);
          setWireMenu(null);
        }}
        onContextMenu={(event) => {
          if (openWireAt(event)) return;
          const target = event.target as HTMLElement;
          if (target.closest(".role-canvas-node")) return;
          event.preventDefault();
          setNodeMenu(null);
          setWireMenu(null);
          setCanvasMenu({ x: event.clientX, y: event.clientY });
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea")) return;
          if (tool === "pan") {
            event.preventDefault();
            const stage = event.currentTarget;
            stage.classList.add("is-grabbing");
            const originLeft = stage.scrollLeft;
            const originTop = stage.scrollTop;
            const startX = event.clientX;
            const startY = event.clientY;
            try {
              stage.setPointerCapture(event.pointerId);
            } catch {
              /* capture is optional */
            }
            function move(next: PointerEvent) {
              if (next.pointerId !== event.pointerId) return;
              stage.scrollLeft = originLeft - (next.clientX - startX);
              stage.scrollTop = originTop - (next.clientY - startY);
            }
            function up(next: PointerEvent) {
              if (next.pointerId !== event.pointerId) return;
              stage.classList.remove("is-grabbing");
              stage.removeEventListener("pointermove", move);
              stage.removeEventListener("pointerup", up);
              stage.removeEventListener("pointercancel", up);
            }
            stage.addEventListener("pointermove", move);
            stage.addEventListener("pointerup", up);
            stage.addEventListener("pointercancel", up);
            return;
          }
          if (target.closest("button, .role-canvas-node, .role-canvas-wires")) return;
          const stage = event.currentTarget;
          const start = canvasPoint(event.clientX, event.clientY);
          const keep = event.shiftKey || event.metaKey || event.ctrlKey ? [...selection] : [];
          let dragged = false;
          try {
            stage.setPointerCapture(event.pointerId);
          } catch {
            /* capture is optional */
          }
          function move(next: PointerEvent) {
            if (next.pointerId !== event.pointerId) return;
            const point = canvasPoint(next.clientX, next.clientY);
            if (!dragged && (next.clientX - event.clientX) ** 2 + (next.clientY - event.clientY) ** 2 < 16) return;
            dragged = true;
            setMarquee({
              left: Math.min(start.x, point.x),
              top: Math.min(start.y, point.y),
              width: Math.abs(point.x - start.x),
              height: Math.abs(point.y - start.y),
            });
          }
          function up(next: PointerEvent) {
            if (next.pointerId !== event.pointerId) return;
            stage.removeEventListener("pointermove", move);
            stage.removeEventListener("pointerup", up);
            stage.removeEventListener("pointercancel", up);
            setMarquee(null);
            setSelectedGroupId(null);
            setLinkOpen(false);
            setNodeError("");
            if (!dragged) {
              setSelection([]);
              setSelectedId(null);
              setDraft(null);
              return;
            }
            const point = canvasPoint(next.clientX, next.clientY);
            const left = Math.min(start.x, point.x);
            const top = Math.min(start.y, point.y);
            const right = Math.max(start.x, point.x);
            const bottom = Math.max(start.y, point.y);
            const board = boardsRef.current.find((item) => item.id === canvas?.id);
            const hidden = hiddenMemberIds(board?.groups ?? []);
            const hits = (board?.nodes ?? []).filter((node) => {
              if (hidden.has(node.id)) return false;
              const card = planeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(node.id)}"]`);
              if (!card || card.offsetWidth < 1) return false;
              return node.x < right && node.x + card.offsetWidth > left && node.y < bottom && node.y + card.offsetHeight > top;
            }).map((node) => node.id);
            const nextIds = [...new Set([...keep, ...hits])];
            setSelection(nextIds);
            if (nextIds.length === 1) setSelectedId(nextIds[0]);
            else {
              setSelectedId(null);
              setDraft(null);
            }
          }
          stage.addEventListener("pointermove", move);
          stage.addEventListener("pointerup", up);
          stage.addEventListener("pointercancel", up);
        }}
      >
        <div className="role-canvas-plane" ref={planeRef}>
          <svg className="role-canvas-guides" aria-hidden="true">
            {guides.map((line, index) => (
              <line key={index} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
            ))}
          </svg>
          <svg className="role-canvas-wires">
            {wires.map((wire) => (
              <g key={wire.id}>
                <path
                  d={wire.d}
                  className={
                    [
                      wire.live ? "is-live" : "",
                      hotWire === wire.id || (wireMenu?.fromId === wire.fromId && wireMenu.toId === wire.toId) ? "is-hot" : "",
                      relationPrompt?.fromId === wire.fromId && relationPrompt.toId === wire.toId ? "is-editing" : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
                {wire.explicit ? (
                  <path
                    className="hit"
                    data-from={wire.fromId}
                    data-to={wire.toId}
                    d={wire.hit}
                    onPointerEnter={() => setHotWire(wire.id)}
                    onPointerLeave={() => setHotWire((current) => (current === wire.id ? null : current))}
                    onContextMenu={(event) => {
                      openWireAt(event);
                    }}
                  />
                ) : null}
                {wire.relation ? (
                  <text className="role-canvas-wire-label" x={wire.mx} y={wire.my - 8} textAnchor="middle">
                    {wire.relation}
                  </text>
                ) : null}
              </g>
            ))}
            {draftWire ? <path className="is-draft" d={wirePath(draftWire.x1, draftWire.y1, draftWire.x2, draftWire.y2)} /> : null}
          </svg>
          {marquee ? (
            <div
              className="role-canvas-marquee"
              style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
            />
          ) : null}
          {canvas?.nodes.filter((node) => !hiddenMemberIds(canvas.groups).has(node.id)).map((node, index) => {
            const faded =
              query.trim() &&
              !`${node.title} ${node.body} ${node.kind}`.toLowerCase().includes(query.trim().toLowerCase());
            return (
              <article
                key={node.id}
                className={[
                  "role-canvas-node",
                  node.kind === "Page" ? "is-page" : "",
                  node.w || node.h ? "is-sized" : "",
                  node.locked ? "is-locked" : "",
                  selection.includes(node.id) ? "is-selected" : "",
                  faded ? "is-filtered" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-id={node.id}
                style={{ left: node.x, top: node.y, width: node.w, height: node.h, zIndex: index + 1 }}
                onPointerDown={(event) => dragNode(event, node)}
                onContextMenu={(event) => {
                  if (openWireAt(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (!selection.includes(node.id)) setSelection([node.id]);
                  setSelectedGroupId(null);
                  setCanvasMenu(null);
                  setWireMenu(null);
                  setNodeMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
                }}
              >
                <button type="button" className={["role-canvas-port", "in", hotTarget === node.id ? "is-hot" : ""].filter(Boolean).join(" ")} data-label="Wire in" aria-label="Wire in" />
                <button type="button" className="role-canvas-port out" data-label="Wire out" aria-label="Wire out" onPointerDown={(event) => startWire(event, node)} />
                <p className="kind">
                  <span>{node.kind}</span>
                  {node.locked ? (
                    <span className="role-canvas-lock" aria-label="Locked">
                      <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.2" rx="1.2" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></svg>
                    </span>
                  ) : null}
                </p>
                <h3 title={node.title || undefined}>{node.title || "Untitled"}</h3>
                {node.kind === "Page" ? (
                  pageSrc(node) ? (
                    <iframe
                      className="role-canvas-page"
                      title={node.title || "Embedded page"}
                      sandbox="allow-scripts allow-forms allow-popups"
                      referrerPolicy="no-referrer"
                      src={pageSrc(node)}
                    />
                  ) : (
                    <iframe
                      className="role-canvas-page"
                      title={node.title || "Embedded page"}
                      sandbox="allow-scripts allow-forms allow-popups"
                      srcDoc={pageDocument(node)}
                    />
                  )
                ) : node.body ? (
                  <p>{node.body}</p>
                ) : null}
                {node.notes.length > 0 ? <p>{node.notes.join(" ")}</p> : null}
                {node.links.length > 0 ? (
                  <p className="links">
                    Links out to{" "}
                    {node.links
                      .map((link) => (link.relation ? `${link.label} (${link.relation})` : link.label))
                      .join(", ")}
                  </p>
                ) : null}
                {node.kind === "Page" && !node.locked ? (
                  <PageHandles node={node} zoom={zoom} onRemember={remember} onResize={(patch) => patchNode(node.id, patch)} />
                ) : null}
              </article>
            );
          })}
          {canvas?.groups.map((group) => {
            const names = group.members
              .map((id) => canvas.nodes.find((node) => node.id === id)?.title)
              .filter(Boolean);
            return (
              <article
                key={group.id}
                className={[
                  "role-canvas-node",
                  "is-group",
                  group.collapsed ? "" : "is-open",
                  selectedGroupId === group.id ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-group={group.id}
                style={{
                  left: group.collapsed ? group.x : Math.max(8, group.x - 28),
                  top: group.y,
                }}
                onPointerDown={(event) => dragGroup(event, group)}
                onContextMenu={(event) => {
                  if (openWireAt(event)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setCanvasMenu(null);
                  setWireMenu(null);
                  setNodeMenu({ kind: "group", id: group.id, x: event.clientX, y: event.clientY });
                }}
              >
                {group.collapsed ? (
                  <>
                    <p className="kind">{group.name}</p>
                    <h3>{group.members.length} cards</h3>
                    {names.length > 0 ? <p>{names.join(", ")}</p> : null}
                  </>
                ) : null}
                <button
                  type="button"
                  className="role-canvas-chevron"
                  aria-label={group.collapsed ? "Open group" : "Close group"}
                  onClick={(event) => {
                    event.stopPropagation();
                    setGroupCollapsed(group, !group.collapsed);
                  }}
                >
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M4 2.2 8 6 4 9.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </article>
            );
          })}
        </div>
      </div>
      {(canvas?.nodes.length ?? 0) === 0 ? (
        <div className="role-canvas-empty">
          <button type="button" className="role-canvas-empty-add" onClick={beginAdd}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M8 3.25v9.5M3.25 8h9.5" /></svg>
            add node
          </button>
          <p>
            Use add node to start.
            {achievementRefs.length > 0 ? " Achievements on this role can be suggested." : null}
          </p>
        </div>
      ) : null}
      <div
        ref={zoomClusterRef}
        className={["role-canvas-zoom", mapBelow ? "is-map-below" : ""].filter(Boolean).join(" ")}
        style={zoomPos ? { left: zoomPos.left, top: zoomPos.top, right: "auto", bottom: "auto" } : undefined}
      >
        <div className="role-canvas-zoom-bar" role="toolbar" aria-label="Canvas zoom" onPointerDown={dragZoom}>
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(zoom / 1.2)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom * 1.2)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </button>
          <button type="button" aria-label="Zoom to fit" onClick={fit}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.25 6.25V3.25h3M9.75 3.25h3v3M12.75 9.75v3h-3M6.25 12.75h-3v-3" /></svg>
          </button>
          <button type="button" aria-pressed={mapOpen} aria-label={mapOpen ? "Hide minimap" : "Show minimap"} onClick={() => setMapOpen((value) => !value)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.25" y="3.25" width="11.5" height="9.5" rx="1.25" /><rect x="4.75" y="5.5" width="4.25" height="3.25" rx="0.4" /></svg>
          </button>
        </div>
        <div className="role-canvas-minimap" hidden={!mapOpen}>
          <Minimap
            nodes={canvas?.nodes ?? []}
            selectedId={selectedId}
            view={view}
            zoom={zoom}
            onJump={(x, y) => {
              const stage = stageRef.current;
              if (!stage) return;
              const origin = planeOrigin();
              stage.scrollLeft = x * zoom - stage.clientWidth / 2 + origin.left;
              stage.scrollTop = y * zoom - stage.clientHeight / 2 + origin.top;
            }}
          />
        </div>
      </div>
      <div className="role-canvas-drawer">
        <div className="role-canvas-tools" role="toolbar" aria-label="Canvas">
          <button type="button" className="tool" aria-pressed={tool === "select"} aria-label="Select" onClick={() => setTool("select")}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.1 1.6 3.3 12.4 6.5 9.4 9.3 14.1 11.1 13.1 8.3 8.4 12.3 8 3.1 1.6Z" /></svg>
          </button>
          <button type="button" className="tool" aria-pressed={tool === "pan"} aria-label="Pan" onClick={() => setTool("pan")}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" d="M6.3 7.5V3.6a.9.9 0 0 1 1.8 0v3.3M8.1 6.4V3a.9.9 0 0 1 1.8 0V7.2M9.9 6.8V4.1a.9.9 0 0 1 1.8 0v4.2c0 2.3-1.5 4-3.8 4h-.5c-2.1 0-3.4-1.4-3.4-3.4V7.2a.9.9 0 0 1 1.8 0" /></svg>
          </button>
          <input
            aria-label="Find a node"
            placeholder="Find a node"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jumpSearch();
              }
            }}
          />
          {query.trim() ? (
            <span className="role-canvas-count">
              {canvas?.nodes.filter((node) => `${node.title} ${node.body} ${node.kind}`.toLowerCase().includes(query.trim().toLowerCase())).length ?? 0} of {canvas?.nodes.length ?? 0}
            </span>
          ) : null}
          <button type="button" className="tool is-add" aria-label="Add node" onClick={beginAdd}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M8 3.25v9.5M3.25 8h9.5" /></svg>
            add node
          </button>
        </div>
      </div>
      </div>
      </div>
      {nodeMenu && canvas ? (
        <CanvasContextMenu x={nodeMenu.x} y={nodeMenu.y}>
          {nodeMenu.kind === "group" ? (
            <MenuButton label="Ungroup" onClick={() => ungroup(nodeMenu.id)} />
          ) : (
            <>
              <MenuButton label="Edit" onClick={() => editNode(nodeMenu.id)} />
              <div className="role-canvas-context-rule" />
              {selection.includes(nodeMenu.id) && selection.length > 1 ? (
                <MenuButton label="Group" onClick={makeGroup} />
              ) : null}
              {canvas.groups
                .filter((group) => !group.collapsed && group.members.includes(nodeMenu.id))
                .flatMap((group) => [
                  <MenuButton key={`${group.id}-collapse`} label="Collapse" onClick={() => setGroupCollapsed(group, true)} />,
                  <MenuButton key={`${group.id}-ungroup`} label="Ungroup" onClick={() => ungroup(group.id)} />,
                ])}
              <MenuButton label="Copy" shortcut="Ctrl C" onClick={() => copyFrom(nodeMenu.id)} />
              <MenuButton label="Duplicate" shortcut="Ctrl D" onClick={() => duplicateFrom(nodeMenu.id)} />
              <MenuButton label="Bring to front" shortcut="Ctrl ]" onClick={() => restack(nodeMenu.id, true)} />
              <MenuButton label="Send to back" shortcut="Ctrl [" onClick={() => restack(nodeMenu.id, false)} />
              <MenuButton
                label={targetsFor(nodeMenu.id).some((item) => !item.locked) ? "Lock" : "Unlock"}
                shortcut="Ctrl L"
                onClick={() => lockTargets(nodeMenu.id)}
              />
              <div className="role-canvas-context-rule" />
              <MenuButton label="Delete" danger onClick={() => deleteFrom(nodeMenu.id)} />
            </>
          )}
        </CanvasContextMenu>
      ) : null}
      {wireMenu ? (
        <CanvasContextMenu x={wireMenu.x} y={wireMenu.y}>
          <MenuButton
            label="Edit relationship"
            onClick={() => openRelation(wireMenu.fromId, wireMenu.toId, wireMenu.x, wireMenu.y, "edit")}
          />
          <MenuButton label="Delete" danger onClick={() => removeLink(wireMenu.fromId, wireMenu.toId)} />
        </CanvasContextMenu>
      ) : null}
      {canvasMenu ? (
        <CanvasContextMenu x={canvasMenu.x} y={canvasMenu.y}>
          <MenuButton
            label="Add node"
            icon={<PlusMark />}
            onClick={() => {
              closeMenus();
              beginAdd();
            }}
          />
          <MenuButton
            label="Paste"
            shortcut="Ctrl V"
            disabled={menuEpoch < 0 || copiedRef.current.length === 0}
            onClick={() => pasteAt(canvasPoint(canvasMenu.x, canvasMenu.y))}
          />
          <MenuButton label="Undo" shortcut="Ctrl Z" disabled={undoRef.current.length === 0} onClick={undo} />
          <MenuButton label="Redo" shortcut="Ctrl Y" disabled={redoRef.current.length === 0} onClick={redo} />
          <div className="role-canvas-context-rule" />
          <MenuButton label="Zoom to fit" onClick={() => { closeMenus(); fit(); }} />
          <MenuButton label="Zoom to 100%" onClick={() => { closeMenus(); changeZoom(1); }} />
          <MenuButton
            label="Unlock all"
            disabled={!canvas?.nodes.some((node) => node.locked)}
            onClick={unlockAll}
          />
        </CanvasContextMenu>
      ) : null}
      {relationPrompt ? (
        <RelationPrompt
          x={relationPrompt.x}
          y={relationPrompt.y}
          mode={relationPrompt.mode}
          value={relationPrompt.value}
          target={canvas?.nodes.find((node) => node.id === relationPrompt.toId)?.title || "this card"}
          onChange={(value) => setRelationPrompt((current) => (current ? { ...current, value } : current))}
          onApply={applyRelation}
          onCancel={() => setRelationPrompt(null)}
        />
      ) : null}
    </div>
  ) : null;

  const linkedList =
    linked.length > 0 ? (
      <>
        <p className="role-canvas-linked-label">Linked</p>
        <ul className="role-canvas-linked">
          {linked.map((node) => (
            <li key={node.id}>
              <button type="button" onClick={() => onLinked(node)}>
                <em>{node.kind}</em>
                <strong>{node.title || "Untitled"}</strong>
              </button>
            </li>
          ))}
        </ul>
      </>
    ) : null;

  const windowHost = minimized ? dockSlot : document.body;

  return (
    <>
      {slot && linkedList ? createPortal(linkedList, slot) : null}
      {windowNode && windowHost ? createPortal(windowNode, windowHost) : null}
      {viewer
        ? createPortal(
            <div className="role-canvas-viewer" role="dialog" aria-label={viewer.title}>
              <header>
                <div>
                  <h2>{viewer.title}</h2>
                  <p>
                    {viewer.kind === "Video"
                      ? "The player stays in this project. A real design film stands in for the foldable upload."
                      : viewer.kind}
                  </p>
                </div>
                <button type="button" onClick={() => setViewer(null)}>
                  Back to the canvas
                </button>
              </header>
              {viewer.kind === "Video" ? (
                filmEmbed(viewer.url) ? (
                  <iframe
                    className="role-canvas-frame"
                    title={viewer.title}
                    src={viewer.url}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video className="role-canvas-frame" controls src={viewer.url} />
                )
              ) : (
                <img className="role-canvas-frame" alt="" src={viewer.url} />
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function clampZoom(value: number) {
  return Math.min(2.5, Math.max(0.35, value));
}

function hiddenMemberIds(groups: CanvasGroup[]) {
  const ids = new Set<string>();
  for (const group of groups) {
    if (group.collapsed) group.members.forEach((id) => ids.add(id));
  }
  return ids;
}

function pageText(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function filmEmbed(url: string) {
  return /youtube|youtu\.be|\/embed\//i.test(url);
}

function pageSrc(node: CanvasNode) {
  return /^https?:\/\//i.test(node.url.trim()) ? node.url.trim() : "";
}

function pageDocument(node: CanvasNode) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#f4f0e8;color:#1c1814;}body{padding:12px 14px;font:14px/1.5 system-ui,sans-serif;}h1{margin:0 0 8px;font-size:16px;line-height:1.3;}p{margin:0;}</style></head><body><h1>${pageText(node.title || "Page")}</h1><p>${pageText(node.body || "")}</p></body></html>`;
}

const PAGE_MIN_W = 220;
const PAGE_MAX_W = 480;
const PAGE_MIN_H = 104;
const PAGE_MAX_H = 360;

function clampSize(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function PageHandles({
  node,
  zoom,
  onRemember,
  onResize,
}: {
  node: CanvasNode;
  zoom: number;
  onRemember: () => void;
  onResize: (patch: Partial<CanvasNode>) => void;
}) {
  function start(event: ReactPointerEvent<HTMLDivElement>, edge: string) {
    if (event.button !== 0 || node.locked) return;
    event.preventDefault();
    event.stopPropagation();
    let remembered = false;
    const startX = event.clientX;
    const startY = event.clientY;
    const originW = node.w || event.currentTarget.parentElement?.offsetWidth || PAGE_MIN_W;
    const originH = node.h || event.currentTarget.parentElement?.offsetHeight || PAGE_MIN_H;
    const originX = node.x;
    const originY = node.y;
    const grip = event.currentTarget;
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = (next.clientX - startX) / zoom;
      const dy = (next.clientY - startY) / zoom;
      let x = originX;
      let y = originY;
      let w = originW;
      let h = originH;
      if (edge.includes("e") || edge.includes("w")) {
        const grown = edge.includes("w") ? originW - dx : originW + dx;
        w = clampSize(grown, PAGE_MIN_W, PAGE_MAX_W);
        if (edge.includes("w")) x = originX + originW - w;
      }
      if (edge.includes("n") || edge.includes("s")) {
        const grown = edge.includes("n") ? originH - dy : originH + dy;
        h = clampSize(grown, PAGE_MIN_H, PAGE_MAX_H);
        if (edge.includes("n")) y = originY + originH - h;
      }
      if (x < 8) {
        w = clampSize(w - (8 - x), PAGE_MIN_W, PAGE_MAX_W);
        x = 8;
      }
      if (y < 8) {
        h = clampSize(h - (8 - y), PAGE_MIN_H, PAGE_MAX_H);
        y = 8;
      }
      if (!remembered) {
        remembered = true;
        onRemember();
      }
      onResize({ x, y, w, h });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  }
  return (
    <>
      {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((edge) => (
        <div key={edge} className={`role-canvas-handle ${edge}`} aria-label="Resize" onPointerDown={(event) => start(event, edge)} />
      ))}
    </>
  );
}

function snapSummary(snap: Snap) {
  const cards = snap.nodes.length;
  const links = snap.nodes.reduce((sum, node) => sum + node.links.length, 0);
  const titles = snap.nodes.map((node) => node.title).filter(Boolean).slice(0, 3);
  const extra = snap.nodes.length - titles.length;
  const names = titles.join(", ") + (extra > 0 ? ` +${extra}` : "");
  return `${cards} ${cards === 1 ? "card" : "cards"} · ${links} ${links === 1 ? "link" : "links"}${names ? ` · ${names}` : ""}`;
}

function CanvasContextMenu({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const pad = 8;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
    const top = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
    setPlace((current) => (current.left === left && current.top === top ? current : { left, top }));
  }, [x, y]);
  return createPortal(
    <div
      ref={ref}
      className="role-canvas-context"
      role="menu"
      style={{ left: place.left, top: place.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

function PlusMark() {
  return (
    <svg className="role-canvas-context-plus" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function MenuButton({
  label,
  shortcut,
  danger,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={danger ? "is-danger" : undefined} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

function RelationPrompt({
  x,
  y,
  mode,
  value,
  target,
  onChange,
  onApply,
  onCancel,
}: {
  x: number;
  y: number;
  mode: "create" | "edit";
  value: string;
  target: string;
  onChange: (value: string) => void;
  onApply: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const pad = 8;
    const rect = panel.getBoundingClientRect();
    const left = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
    const top = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
    setPlace((current) => (current.left === left && current.top === top ? current : { left, top }));
  }, [x, y]);
  return createPortal(
    <form
      ref={ref}
      className="role-canvas-relation"
      style={{ left: place.left, top: place.top }}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(value);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p>{mode === "edit" ? "Edit relationship" : "Relationship"}</p>
      <p className="role-canvas-relation-target">to {target}</p>
      <div className="role-canvas-relation-kinds">
        {RELATION_KINDS.map((kind) => (
          <button key={kind} type="button" onClick={() => onApply(kind)}>
            {kind}
          </button>
        ))}
      </div>
      <label>
        Or type one
        <input aria-label="Relationship" value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
      </label>
      <div className="role-canvas-relation-actions">
        <button type="submit">Set</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>,
    document.body,
  );
}

function hitStroke(x1: number, y1: number, x2: number, y2: number) {
  const bend = Math.max(40, (x2 - x1) / 2);
  const samples: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * (x1 + bend) + 3 * u * t * t * (x2 - bend) + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    if (Math.hypot(x - x1, y - y1) < 20 || Math.hypot(x - x2, y - y2) < 20) continue;
    samples.push(`${samples.length ? "L" : "M"} ${x} ${y}`);
  }
  return samples.length > 1 ? samples.join(" ") : wirePath(x1, y1, x2, y2);
}

function wirePath(x1: number, y1: number, x2: number, y2: number) {
  const bend = Math.max(40, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function useWires(canvas: CanvasBoard | undefined, active: boolean, zoom: number, selectedId: string | null) {
  const [wires, setWires] = useState<
    Array<{ id: string; fromId: string; toId: string; d: string; hit: string; live: boolean; explicit: boolean; relation: string; mx: number; my: number }>
  >([]);
  useLayoutEffect(() => {
    if (!active || !canvas) {
      setWires([]);
      return;
    }
    const next: Array<{ id: string; fromId: string; toId: string; d: string; hit: string; live: boolean; explicit: boolean; relation: string; mx: number; my: number }> = [];
    const pairs: Array<[string, string]> = [];
    for (const node of canvas.nodes) {
      for (const link of node.links) {
        if (!canvas.nodes.some((item) => item.id === link.id)) continue;
        if (!pairs.some(([from, to]) => from === node.id && to === link.id)) pairs.push([node.id, link.id]);
      }
    }
    const root = document.querySelector(".role-canvas");
    const end = (id: string) => {
      const group = canvas.groups.find((item) => item.collapsed && item.members.includes(id));
      if (group) {
        const el = root?.querySelector<HTMLElement>(`[data-group="${CSS.escape(group.id)}"]`);
        return {
          x: group.x,
          y: group.y,
          w: el?.offsetWidth || 208,
          h: el?.offsetHeight || 96,
        };
      }
      const node = canvas.nodes.find((item) => item.id === id);
      const el = root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
      if (!node) return null;
      return {
        x: node.x,
        y: node.y,
        w: el?.offsetWidth || node.w || 220,
        h: el?.offsetHeight || node.h || 88,
      };
    };
    for (const [fromId, toId] of pairs) {
      const from = end(fromId);
      const to = end(toId);
      if (!from || !to) continue;
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      const explicit = canvas.nodes.some((node) => node.id === fromId && node.links.some((link) => link.id === toId));
      const relation = explicit
        ? canvas.nodes.find((node) => node.id === fromId)?.links.find((link) => link.id === toId)?.relation ?? ""
        : "";
      next.push({
        id: `${fromId}-${toId}`,
        fromId,
        toId,
        d: wirePath(x1, y1, x2, y2),
        hit: hitStroke(x1, y1, x2, y2),
        live: selectedId === fromId || selectedId === toId,
        explicit,
        relation,
        mx: (x1 + x2) / 2,
        my: (y1 + y2) / 2,
      });
    }
    setWires(next);
  }, [active, canvas, zoom, selectedId]);
  return wires;
}

function Minimap({
  nodes,
  selectedId,
  view,
  zoom,
  onJump,
}: {
  nodes: CanvasNode[];
  selectedId: string | null;
  view: { left: number; top: number; width: number; height: number };
  zoom: number;
  onJump: (x: number, y: number) => void;
}) {
  const width = 184;
  const height = 112;
  const margin = 8;
  const seen = { x: view.left / zoom, y: view.top / zoom, w: Math.max(1, view.width / zoom), h: Math.max(1, view.height / zoom) };
  const boxes = nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, w: 208, h: 88 }));
  const all = boxes.length ? [...boxes, seen] : [seen];
  const left = Math.min(...all.map((box) => box.x)) - 24;
  const top = Math.min(...all.map((box) => box.y)) - 24;
  const right = Math.max(...all.map((box) => box.x + box.w)) + 24;
  const bottom = Math.max(...all.map((box) => box.y + box.h)) + 24;
  const scale = Math.min((width - margin * 2) / Math.max(1, right - left), (height - margin * 2) / Math.max(1, bottom - top));
  const ox = margin + (width - margin * 2 - (right - left) * scale) / 2;
  const oy = margin + (height - margin * 2 - (bottom - top) * scale) / 2;
  const place = (box: { x: number; y: number; w: number; h: number }) => ({
    x: ox + (box.x - left) * scale,
    y: oy + (box.y - top) * scale,
    w: Math.max(box.w * scale, 3),
    h: Math.max(box.h * scale, 3),
  });
  const frame = place(seen);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Canvas overview"
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width) * width;
        const py = ((event.clientY - rect.top) / rect.height) * height;
        onJump(left + (px - ox) / scale, top + (py - oy) / scale);
      }}
    >
      <rect width={width} height={height} fill="#100e0c" />
      {boxes.map((box) => {
        const at = place(box);
        return (
          <rect
            key={box.id}
            className={box.id === selectedId ? "mark is-selected" : "mark"}
            x={at.x}
            y={at.y}
            width={at.w}
            height={at.h}
            rx="2"
          />
        );
      })}
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.72)" strokeWidth="1.5" rx="2" />
    </svg>
  );
}

function MinIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1.5 8.5h9" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.6" y="1.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MaxIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <rect x="3.5" y="1.1" width="7.2" height="7.2" fill="#0d0b09" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.2" y="3.4" width="7.2" height="7.2" fill="#0d0b09" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function boardsUnderRole(item: WorkMapRole, live: CanvasBoard[]): CanvasBoard[] {
  return reflectRole(loadBoards(item), item).map(
    (board) => live.find((current) => current.id === board.id) ?? board,
  );
}

function OverviewRail({
  roles,
  boards,
  kind,
  query,
  roleId,
  canvasId,
  onKind,
  onRole,
  onOpenRole,
  onBoard,
}: {
  roles: WorkMapRole[];
  boards: CanvasBoard[];
  kind: "all" | CareerHistorySectionKey;
  query: string;
  roleId: string | null;
  canvasId: string;
  onKind: (next: "all" | CareerHistorySectionKey) => void;
  onRole: (item: WorkMapRole) => void;
  onOpenRole?: (item: WorkMapRole) => void;
  onBoard: (boardId: string) => void;
}) {
  const needle = query.trim().toLowerCase();
  const sections = CAREER_HISTORY_SECTIONS.filter((section) => kind === "all" || kind === section.key);
  const rendered = sections.map((section) => {
    const rows = roles.flatMap((item) => {
      if (classifyCareerHistorySection(item) !== section.key) return [];
      const owned = boardsUnderRole(item, boards);
      const roleHit =
        !needle || [item.organization, item.title].join(" ").toLowerCase().includes(needle);
      const visible = roleHit
        ? owned
        : owned.filter((board) => board.name.toLowerCase().includes(needle));
      if (!roleHit && visible.length === 0) return [];
      return [{ item, boards: visible }];
    });
    if (rows.length === 0) return null;
    return (
      <div key={section.key}>
        <button type="button" className="role-canvas-rail-cat" onClick={() => onKind(section.key)}>
          {section.label}
        </button>
        {rows.map(({ item, boards: owned }) => {
          const name = item.organization || item.title || "This role";
          const opened = roleId === item.id;
          return (
          <div key={item.id}>
            <div className={opened ? "role-canvas-rail-role is-on" : "role-canvas-rail-role"}>
              <button
                type="button"
                className="role-canvas-rail-name"
                aria-expanded={opened}
                onClick={() => onRole(item)}
              >
                {name}
              </button>
              <b>{owned.length}</b>
              <button
                type="button"
                className="role-canvas-rail-open"
                aria-label={`Open ${name}`}
                onClick={() => (onOpenRole ?? onRole)(item)}
              >
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M4 2.2 8 6 4 9.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            {opened ? (
              <div className="role-canvas-rail-own">
                {owned.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className={board.id === canvasId ? "is-on" : ""}
                    aria-current={board.id === canvasId ? "page" : undefined}
                    onClick={() => onBoard(board.id)}
                  >
                    <span>{board.id === item.id ? item.title || "This role" : board.name}</span>
                    <b>{board.nodes.length}</b>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          );
        })}
      </div>
    );
  });
  const studies =
    kind === "all"
      ? boards.filter(
          (board) =>
            !roles.some((item) => item.id === board.id) &&
            (!needle || board.name.toLowerCase().includes(needle)),
        )
      : [];
  if (rendered.every((section) => section === null) && studies.length === 0) {
    return <p>No boards match.</p>;
  }
  return (
    <>
      {rendered}
      {studies.length > 0 ? (
        <div>
          <p>Studies</p>
          {studies.map((board) => (
            <button
              key={board.id}
              type="button"
              className={board.id === canvasId ? "is-on" : ""}
              aria-current={board.id === canvasId ? "page" : undefined}
              onClick={() => onBoard(board.id)}
            >
              <span>{board.name}</span>
              <b>{board.nodes.length}</b>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function boardGroups(
  boards: CanvasBoard[],
  roleId: string,
  query: string,
  scope: "role" | "all" = "role",
  roles: WorkMapRole[] = [],
  kind: "all" | CareerHistorySectionKey = "all",
) {
  const needle = query.trim().toLowerCase();
  const matches = (board: CanvasBoard) => {
    if (!needle) return true;
    const owner = roles.find((item) => item.id === board.id);
    return [board.name, owner?.organization, owner?.title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  };
  if (scope !== "all") {
    const listed = boards.filter((board) => !needle || board.name.toLowerCase().includes(needle));
    return [
      { label: "This role", boards: listed.filter((board) => board.id === roleId) },
      { label: "Studies", boards: listed.filter((board) => board.id !== roleId) },
    ].filter((group) => group.boards.length > 0);
  }
  const sections =
    kind === "all"
      ? CAREER_HISTORY_SECTIONS
      : CAREER_HISTORY_SECTIONS.filter((section) => section.key === kind);
  const groups: { label: string; boards: CanvasBoard[] }[] = sections
    .map((section) => ({
      label: section.label,
      boards: roles
        .filter((item) => classifyCareerHistorySection(item) === section.key)
        .map((item) => boards.find((board) => board.id === item.id))
        .filter((board): board is CanvasBoard => Boolean(board && matches(board))),
    }))
    .filter((group) => group.boards.length > 0);
  if (kind === "all") {
    const studies = boards.filter(
      (board) => !roles.some((item) => item.id === board.id) && matches(board),
    );
    if (studies.length > 0) groups.push({ label: "Studies", boards: studies });
  }
  return groups;
}


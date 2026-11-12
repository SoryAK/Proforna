import { isCanvasNodeKind } from "./canvas-node";
import type { CanvasBoard, CanvasLink, CanvasNode } from "./canvas-board";

export const CANVAS_ACTION_NAMES = [
  "list-boards",
  "open-board",
  "add-node",
  "move-node",
  "link-nodes",
  "group-nodes",
  "add-note",
] as const;

export type CanvasActionName = (typeof CANVAS_ACTION_NAMES)[number];

export type CanvasBoardSource = {
  role: string;
  boards: readonly CanvasBoard[];
};

export type CanvasBoardSummary = {
  id: string;
  name: string;
  role: string;
  nodes: number;
};

export type CanvasActionError =
  | "board-missing"
  | "node-missing"
  | "kind-invalid"
  | "title-required"
  | "note-empty"
  | "id-taken";

export type CanvasWrite =
  | { name: "add-node"; input: { id: string; kind: string; title: string; x: number; y: number } }
  | { name: "move-node"; input: { nodeId: string; x: number; y: number } }
  | { name: "link-nodes"; input: { fromId: string; toId: string; label: string } }
  | { name: "group-nodes"; input: { id: string; name: string; memberIds: readonly string[] } }
  | { name: "add-note"; input: { nodeId: string; text: string } };

export type CanvasSaveResult =
  | { ok: true; boards: CanvasBoard[]; board: CanvasBoard; revision: number }
  | { ok: false; error: CanvasActionError | "revision-stale"; revision: number };

export type CanvasActionResult<T> = { ok: true } & T | { ok: false; error: CanvasActionError };

export function listCanvasBoards(sources: readonly CanvasBoardSource[]): CanvasBoardSummary[] {
  return sources.flatMap((source) =>
    source.boards.map((board) => ({
      id: board.id,
      name: board.name,
      role: source.role,
      nodes: board.nodes.length,
    })),
  );
}

export function openCanvasBoard(
  boards: readonly CanvasBoard[],
  boardId: string,
): CanvasActionResult<{ board: CanvasBoard }> {
  const board = boards.find((item) => item.id === boardId);
  if (!board) return { ok: false, error: "board-missing" };
  return { ok: true, board };
}

export function addCanvasNode(
  board: CanvasBoard,
  input: { id: string; kind: string; title: string; x: number; y: number },
): CanvasActionResult<{ nodeId: string; board: CanvasBoard }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "title-required" };
  if (!isCanvasNodeKind(input.kind)) return { ok: false, error: "kind-invalid" };
  if (board.nodes.some((node) => node.id === input.id)) return { ok: false, error: "id-taken" };
  const node: CanvasNode = {
    id: input.id,
    kind: input.kind,
    title,
    body: "",
    x: input.x,
    y: input.y,
    url: "",
    notes: [],
    links: [],
  };
  return { ok: true, nodeId: node.id, board: { ...board, nodes: [...board.nodes, node] } };
}

export function moveCanvasNode(
  board: CanvasBoard,
  input: { nodeId: string; x: number; y: number },
): CanvasActionResult<{ board: CanvasBoard }> {
  if (!board.nodes.some((node) => node.id === input.nodeId)) return { ok: false, error: "node-missing" };
  return {
    ok: true,
    board: {
      ...board,
      nodes: board.nodes.map((node) => (node.id === input.nodeId ? { ...node, x: input.x, y: input.y } : node)),
    },
  };
}

export function linkCanvasNodes(
  board: CanvasBoard,
  input: { fromId: string; toId: string; label: string },
): CanvasActionResult<{ board: CanvasBoard }> {
  const from = board.nodes.find((node) => node.id === input.fromId);
  const to = board.nodes.find((node) => node.id === input.toId);
  if (!from || !to) return { ok: false, error: "node-missing" };
  if (from.links.some((link) => link.id === to.id)) return { ok: true, board };
  const link: CanvasLink = { key: to.id, id: to.id, label: input.label };
  return {
    ok: true,
    board: {
      ...board,
      nodes: board.nodes.map((node) => (node.id === from.id ? { ...node, links: [...node.links, link] } : node)),
    },
  };
}

export function groupCanvasNodes(
  board: CanvasBoard,
  input: { id: string; name: string; memberIds: readonly string[] },
): CanvasActionResult<{ board: CanvasBoard }> {
  const members = input.memberIds.map((id) => board.nodes.find((node) => node.id === id));
  if (members.some((node) => !node)) return { ok: false, error: "node-missing" };
  if (board.groups.some((group) => group.id === input.id)) return { ok: false, error: "id-taken" };
  const anchor = members[0];
  return {
    ok: true,
    board: {
      ...board,
      groups: [
        ...board.groups,
        {
          id: input.id,
          name: input.name,
          members: [...input.memberIds],
          collapsed: false,
          x: anchor?.x ?? 0,
          y: anchor?.y ?? 0,
        },
      ],
    },
  };
}

export function applyCanvasSave(input: {
  boards: readonly CanvasBoard[];
  revision: number;
  expectedRevision: number;
  boardId: string;
  action: CanvasWrite;
}): CanvasSaveResult {
  if (input.expectedRevision !== input.revision) {
    return { ok: false, error: "revision-stale", revision: input.revision };
  }
  const opened = openCanvasBoard(input.boards, input.boardId);
  if (!opened.ok) return { ok: false, error: opened.error, revision: input.revision };
  const applied = applyWrite(opened.board, input.action);
  if (!applied.ok) return { ok: false, error: applied.error, revision: input.revision };
  return {
    ok: true,
    board: applied.board,
    boards: input.boards.map((item) => (item.id === applied.board.id ? applied.board : item)),
    revision: input.revision + 1,
  };
}

function applyWrite(board: CanvasBoard, action: CanvasWrite): CanvasActionResult<{ board: CanvasBoard }> {
  switch (action.name) {
    case "add-node":
      return addCanvasNode(board, action.input);
    case "move-node":
      return moveCanvasNode(board, action.input);
    case "link-nodes":
      return linkCanvasNodes(board, action.input);
    case "group-nodes":
      return groupCanvasNodes(board, action.input);
    case "add-note":
      return addCanvasNote(board, action.input);
  }
}

export function readCanvasWrite(value: unknown): CanvasWrite | null {
  if (!value || typeof value !== "object") return null;
  const action = value as { name?: unknown; input?: unknown };
  const input = action.input;
  if (!input || typeof input !== "object") return null;
  const fields = input as Record<string, unknown>;
  if (action.name === "add-node") {
    if (typeof fields.id !== "string" || typeof fields.kind !== "string" || typeof fields.title !== "string") return null;
    if (typeof fields.x !== "number" || typeof fields.y !== "number") return null;
    return { name: "add-node", input: { id: fields.id, kind: fields.kind, title: fields.title, x: fields.x, y: fields.y } };
  }
  if (action.name === "move-node") {
    if (typeof fields.nodeId !== "string" || typeof fields.x !== "number" || typeof fields.y !== "number") return null;
    return { name: "move-node", input: { nodeId: fields.nodeId, x: fields.x, y: fields.y } };
  }
  if (action.name === "link-nodes") {
    if (typeof fields.fromId !== "string" || typeof fields.toId !== "string" || typeof fields.label !== "string") return null;
    return { name: "link-nodes", input: { fromId: fields.fromId, toId: fields.toId, label: fields.label } };
  }
  if (action.name === "group-nodes") {
    if (typeof fields.id !== "string" || typeof fields.name !== "string" || !Array.isArray(fields.memberIds)) return null;
    if (!fields.memberIds.every((id) => typeof id === "string")) return null;
    return { name: "group-nodes", input: { id: fields.id, name: fields.name, memberIds: fields.memberIds } };
  }
  if (action.name === "add-note") {
    if (typeof fields.nodeId !== "string" || typeof fields.text !== "string") return null;
    return { name: "add-note", input: { nodeId: fields.nodeId, text: fields.text } };
  }
  return null;
}

export function addCanvasNote(
  board: CanvasBoard,
  input: { nodeId: string; text: string },
): CanvasActionResult<{ board: CanvasBoard }> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "note-empty" };
  if (!board.nodes.some((node) => node.id === input.nodeId)) return { ok: false, error: "node-missing" };
  return {
    ok: true,
    board: {
      ...board,
      nodes: board.nodes.map((node) => (node.id === input.nodeId ? { ...node, notes: [...node.notes, text] } : node)),
    },
  };
}

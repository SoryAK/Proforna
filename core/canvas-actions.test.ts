import { describe, expect, it } from "vitest";
import {
  addCanvasNode,
  addCanvasNote,
  applyCanvasSave,
  groupCanvasNodes,
  linkCanvasNodes,
  listCanvasBoards,
  moveCanvasNode,
  openCanvasBoard,
} from "./canvas-actions";
import type { CanvasBoard } from "./canvas-board";

function board(): CanvasBoard {
  return {
    id: "role-1",
    name: "Technician",
    nodes: [
      {
        id: "hinge",
        kind: "Design",
        title: "Hinge",
        body: "",
        x: 40,
        y: 80,
        url: "",
        notes: [],
        links: [],
      },
      {
        id: "photo",
        kind: "Photo",
        title: "Cover",
        body: "",
        x: 200,
        y: 80,
        url: "",
        notes: ["Kept"],
        links: [],
      },
    ],
    groups: [],
  };
}

describe("canvas actions", () => {
  it("lists role boards and study boards with a node count", () => {
    expect(
      listCanvasBoards([
        { role: "Giants Direct", boards: [board()] },
        {
          role: "Study",
          boards: [{ id: "study-1", name: "Hinge study", nodes: [], groups: [] }],
        },
      ]),
    ).toEqual([
      { id: "role-1", name: "Technician", role: "Giants Direct", nodes: 2 },
      { id: "study-1", name: "Hinge study", role: "Study", nodes: 0 },
    ]);
  });

  it("opens a board that already exists and does not create a missing one", () => {
    const saved = board();
    expect(openCanvasBoard([saved], "role-1")).toEqual({ ok: true, board: saved });
    expect(openCanvasBoard([saved], "missing")).toEqual({ ok: false, error: "board-missing" });
    expect(saved.nodes).toHaveLength(2);
  });

  it("adds a node at a position and returns its id", () => {
    const saved = board();
    const added = addCanvasNode(saved, {
      id: "note-1",
      kind: "Text",
      title: "Shop note",
      x: 12,
      y: 24,
    });
    expect(added).toEqual({
      ok: true,
      nodeId: "note-1",
      board: {
        ...saved,
        nodes: [
          ...saved.nodes,
          {
            id: "note-1",
            kind: "Text",
            title: "Shop note",
            body: "",
            x: 12,
            y: 24,
            url: "",
            notes: [],
            links: [],
          },
        ],
      },
    });
    expect(saved.nodes).toHaveLength(2);
  });

  it("refuses a node with a blank title or an unknown kind", () => {
    const saved = board();
    expect(addCanvasNode(saved, { id: "n", kind: "Text", title: "  ", x: 0, y: 0 })).toEqual({
      ok: false,
      error: "title-required",
    });
    expect(addCanvasNode(saved, { id: "n", kind: "Achievement", title: "Shipped", x: 0, y: 0 })).toEqual({
      ok: false,
      error: "kind-invalid",
    });
  });

  it("moves one node and leaves the others in place", () => {
    const saved = board();
    const moved = moveCanvasNode(saved, { nodeId: "hinge", x: 90, y: 10 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.board.nodes.find((node) => node.id === "hinge")).toMatchObject({ x: 90, y: 10, title: "Hinge" });
    expect(moved.board.nodes.find((node) => node.id === "photo")).toMatchObject({ x: 200, y: 80 });
    expect(moveCanvasNode(saved, { nodeId: "missing", x: 1, y: 1 })).toEqual({
      ok: false,
      error: "node-missing",
    });
  });

  it("links two existing nodes and refuses an unknown end", () => {
    const saved = board();
    const linked = linkCanvasNodes(saved, { fromId: "hinge", toId: "photo", label: "Shows" });
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;
    expect(linked.board.nodes.find((node) => node.id === "hinge")?.links).toEqual([
      { key: "photo", id: "photo", label: "Shows" },
    ]);
    expect(linkCanvasNodes(saved, { fromId: "hinge", toId: "missing", label: "Shows" })).toEqual({
      ok: false,
      error: "node-missing",
    });
    expect(linkCanvasNodes(linked.board, { fromId: "hinge", toId: "photo", label: "Shows" })).toEqual(linked);
  });

  it("groups existing members under a name", () => {
    const saved = board();
    const grouped = groupCanvasNodes(saved, { id: "group-1", name: "Shop", memberIds: ["hinge", "photo"] });
    expect(grouped).toEqual({
      ok: true,
      board: {
        ...saved,
        groups: [{ id: "group-1", name: "Shop", members: ["hinge", "photo"], collapsed: false, x: 40, y: 80 }],
      },
    });
    expect(groupCanvasNodes(saved, { id: "group-2", name: "Shop", memberIds: ["hinge", "missing"] })).toEqual({
      ok: false,
      error: "node-missing",
    });
  });

  it("appends a note and refuses a blank one", () => {
    const saved = board();
    const noted = addCanvasNote(saved, { nodeId: "photo", text: "  Check the cover  " });
    expect(noted.ok).toBe(true);
    if (!noted.ok) return;
    expect(noted.board.nodes.find((node) => node.id === "photo")?.notes).toEqual(["Kept", "Check the cover"]);
    expect(addCanvasNote(saved, { nodeId: "photo", text: "   " })).toEqual({ ok: false, error: "note-empty" });
    expect(addCanvasNote(saved, { nodeId: "missing", text: "Hello" })).toEqual({
      ok: false,
      error: "node-missing",
    });
  });

  it("applies one action and advances the revision", () => {
    const saved = board();
    const other: CanvasBoard = { id: "role-2", name: "Other", nodes: [], groups: [] };
    const savedBoards = [saved, other];
    const applied = applyCanvasSave({
      boards: savedBoards,
      revision: 2,
      expectedRevision: 2,
      boardId: "role-1",
      action: { name: "move-node", input: { nodeId: "hinge", x: 9, y: 8 } },
    });
    expect(applied).toMatchObject({ ok: true, revision: 3 });
    if (!applied.ok) return;
    expect(applied.board.nodes.find((node) => node.id === "hinge")).toMatchObject({ x: 9, y: 8 });
    expect(applied.boards.find((item) => item.id === "role-2")).toBe(other);
    expect(saved.nodes.find((node) => node.id === "hinge")).toMatchObject({ x: 40, y: 80 });
  });

  it("keeps the current revision when the expected revision is stale", () => {
    const saved = board();
    expect(
      applyCanvasSave({
        boards: [saved],
        revision: 4,
        expectedRevision: 3,
        boardId: "role-1",
        action: { name: "add-note", input: { nodeId: "photo", text: "Late" } },
      }),
    ).toEqual({ ok: false, error: "revision-stale", revision: 4 });
    expect(saved.nodes.find((node) => node.id === "photo")?.notes).toEqual(["Kept"]);
  });
});

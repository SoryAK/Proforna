import { describe, expect, it } from "vitest";
import { readCanvasBoards } from "./canvas-board";

describe("readCanvasBoards", () => {
  it("keeps a placed node's position and drops a board with no id", () => {
    const boards = readCanvasBoards([
      {
        id: "role-1",
        name: "Technician",
        nodes: [{ id: "node-1", title: "Hinge", x: 320, y: 140, links: [{ id: "video", label: "Review" }] }],
        groups: [],
      },
      { name: "Missing id" },
    ]);
    expect(boards).toEqual([
      {
        id: "role-1",
        name: "Technician",
        nodes: [
          {
            id: "node-1",
            kind: "Design",
            title: "Hinge",
            body: "",
            x: 320,
            y: 140,
            url: "",
            notes: [],
            links: [{ key: "video", id: "video", label: "Review", relation: undefined }],
            locked: undefined,
            achievementId: undefined,
          },
        ],
        groups: [],
      },
    ]);
  });

  it("treats an empty list as no saved arrangement", () => {
    expect(readCanvasBoards([])).toBeNull();
    expect(readCanvasBoards(null)).toBeNull();
  });
});

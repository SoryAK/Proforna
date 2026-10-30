import { describe, expect, it } from "vitest";
import { readCanvasBoards, releasePointingMembers } from "./canvas-board";

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

  it("keeps a document on a node and drops one with no id", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "north",
            title: "North",
            document: { id: "doc-1", name: "Service brief.txt", mediaType: "text/plain" },
          },
          { id: "east", title: "East", document: { name: "Missing" } },
        ],
        groups: [],
      },
    ]);
    expect(boards?.[0].nodes[0].document).toEqual({
      id: "doc-1",
      name: "Service brief.txt",
      mediaType: "text/plain",
    });
    expect(boards?.[0].nodes[1].document).toBeUndefined();
  });

  it("drops a member that points at its own group and keeps the link", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          { id: "north", title: "North", links: [{ id: "cluster", label: "Cluster", relation: "example" }] },
          { id: "east", title: "East" },
          { id: "south", title: "South" },
        ],
        groups: [{ id: "cluster", name: "Cluster", members: ["north", "east", "south"], x: 10, y: 20 }],
      },
    ]);
    expect(boards?.[0].groups[0].members).toEqual(["east", "south"]);
    expect(boards?.[0].nodes.find((node) => node.id === "north")?.links.map((link) => link.id)).toEqual(["cluster"]);
  });
});

describe("releasePointingMembers", () => {
  it("refuses a group that would only contain a node pointing at it", () => {
    const board = releasePointingMembers({
      id: "demo",
      name: "Demo",
      nodes: [
        {
          id: "west",
          kind: "Design",
          title: "West",
          body: "",
          x: 1,
          y: 2,
          url: "",
          notes: [],
          links: [{ key: "cluster", id: "cluster", label: "Cluster", relation: "example" }],
        },
        {
          id: "east",
          kind: "Design",
          title: "East",
          body: "",
          x: 3,
          y: 4,
          url: "",
          notes: [],
          links: [],
        },
      ],
      groups: [{ id: "cluster", name: "Cluster", members: ["west", "east"], collapsed: false, x: 0, y: 0 }],
    });
    expect(board.groups).toEqual([]);
    expect(board.nodes.find((node) => node.id === "west")?.links).toEqual([]);
  });
});

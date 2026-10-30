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

  it("keeps a photo file on a photo node and does not keep it as a document", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "still",
            kind: "Photo",
            title: "Still",
            body: "A still from the floor.",
            photo: { id: "pic-1", name: "still.png", mediaType: "image/png" },
          },
          {
            id: "legacy",
            kind: "Photo",
            title: "Legacy",
            document: { id: "pic-2", name: "floor.jpg", mediaType: "image/jpeg" },
          },
          {
            id: "note",
            kind: "Photo",
            title: "Note",
            document: { id: "doc-9", name: "notes.txt", mediaType: "text/plain" },
          },
        ],
        groups: [],
      },
    ]);
    expect(boards?.[0].nodes[0].photo).toEqual({
      id: "pic-1",
      name: "still.png",
      mediaType: "image/png",
    });
    expect(boards?.[0].nodes[0].document).toBeUndefined();
    expect(boards?.[0].nodes[1].photo).toEqual({
      id: "pic-2",
      name: "floor.jpg",
      mediaType: "image/jpeg",
    });
    expect(boards?.[0].nodes[1].document).toBeUndefined();
    expect(boards?.[0].nodes[2].photo).toBeUndefined();
    expect(boards?.[0].nodes[2].document).toBeUndefined();
  });

  it("keeps a sequence of nodes that are still on the board", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          { id: "north", title: "North" },
          { id: "clip", title: "Clip" },
        ],
        sequence: ["clip", "missing", "north", "clip"],
        groups: [],
      },
    ]);
    expect(boards?.[0].sequence).toEqual(["clip", "north"]);
  });

  it("keeps a model and an opening view on a 3D node", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "hinge",
            kind: "3D",
            title: "Hinge",
            model: { id: "model-1", name: "hinge.glb", mediaType: "model/gltf-binary" },
            viewMode: "orbit",
          },
          { id: "sign", kind: "Demonstration", title: "Product demonstration" },
        ],
        groups: [],
      },
    ]);
    expect(boards?.[0].nodes[0].model).toEqual({
      id: "model-1",
      name: "hinge.glb",
      mediaType: "model/gltf-binary",
    });
    expect(boards?.[0].nodes[0].viewMode).toBe("orbit");
    expect(boards?.[0].nodes[1].kind).toBe("Demonstration");
    expect(boards?.[0].nodes[1].model).toBeUndefined();
  });

  it("keeps a place on a location node and drops a place with no coordinates", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "floor",
            kind: "Location",
            title: "Lancaster",
            place: { address: "Lancaster, PA", latitude: 40.0379, longitude: -76.3055 },
          },
          { id: "blank", kind: "Location", title: "Unplaced", place: { address: "Somewhere" } },
        ],
        groups: [],
      },
    ]);
    expect(boards?.[0].nodes[0].place).toEqual({
      address: "Lancaster, PA",
      latitude: 40.0379,
      longitude: -76.3055,
    });
    expect(boards?.[0].nodes[1].place).toBeUndefined();
  });

  it("keeps strokes on a drawing node and drops a point outside the surface", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "mark",
            kind: "Drawing",
            title: "Drawing",
            strokes: [
              [
                { x: 0.1, y: 0.2 },
                { x: 0.4, y: 0.8 },
              ],
              [{ x: 2, y: 0.2 }],
            ],
          },
        ],
        groups: [],
      },
    ]);
    expect(boards?.[0].nodes[0].strokes).toEqual([
      [
        { x: 0.1, y: 0.2 },
        { x: 0.4, y: 0.8 },
      ],
    ]);
  });

  it("keeps several assets on an event and an event group", () => {
    const boards = readCanvasBoards([
      {
        id: "demo",
        name: "Demo",
        nodes: [
          {
            id: "launch",
            kind: "Event",
            title: "Launch",
            assets: [
              { id: "clip", name: "clip.webm", mediaType: "video/webm" },
              { name: "missing" },
            ],
          },
        ],
        groups: [{ id: "event-1", name: "Event", members: ["launch", "north"], event: true, x: 8, y: 12 }],
      },
    ]);
    expect(boards?.[0].nodes[0].assets).toEqual([
      { id: "clip", name: "clip.webm", mediaType: "video/webm" },
    ]);
    expect(boards?.[0].groups[0].event).toBe(true);
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

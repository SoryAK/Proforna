import { describe, expect, it } from "vitest";
import { prepareCanvasNode, removeCanvasNode } from "./canvas-node";

describe("canvas nodes", () => {
  it("keeps a titled node of a known kind", () => {
    expect(
      prepareCanvasNode({
        kind: "Design",
        title: "  Hinge study  ",
        body: "How it folds.",
        url: " https://example.com/hinge ",
      }),
    ).toEqual({
      ok: true,
      value: {
        kind: "Design",
        title: "Hinge study",
        body: "How it folds.",
        url: "https://example.com/hinge",
      },
    });
  });

  it("refuses a node with no title", () => {
    expect(prepareCanvasNode({ kind: "Role", title: "   ", body: "", url: "" })).toEqual({
      ok: false,
      error: "title-required",
    });
  });

  it("refuses a kind the canvas does not use", () => {
    expect(prepareCanvasNode({ kind: "Achievement", title: "Shipped it", body: "", url: "" })).toEqual({
      ok: false,
      error: "kind-invalid",
    });
  });

  it("removes a node and the links that pointed at it", () => {
    const next = removeCanvasNode(
      [
        { id: "role", links: [{ id: "demo" }] },
        { id: "demo", links: [{ id: "role" }] },
      ],
      "demo",
    );
    expect(next).toEqual([{ id: "role", links: [] }]);
    expect(removeCanvasNode([{ id: "role", links: [] }], "missing")).toBeNull();
  });
});

export const CANVAS_NODE_KINDS = ["Role", "Design", "Demonstration", "Video", "Photo", "Page", "Event"] as const;

export type CanvasNodeKind = (typeof CANVAS_NODE_KINDS)[number];

export type CanvasNodeFields = {
  kind: CanvasNodeKind;
  title: string;
  body: string;
  url: string;
};

export type CanvasNodeError = "title-required" | "kind-invalid";

export function prepareCanvasNode(input: {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
}): { ok: true; value: CanvasNodeFields } | { ok: false; error: CanvasNodeError } {
  const title = text(input.title);
  if (!title) return { ok: false, error: "title-required" };
  const kind = text(input.kind);
  if (!isCanvasNodeKind(kind)) return { ok: false, error: "kind-invalid" };
  return { ok: true, value: { kind, title, body: text(input.body), url: text(input.url) } };
}

export function isCanvasNodeKind(value: string): value is CanvasNodeKind {
  return (CANVAS_NODE_KINDS as readonly string[]).includes(value);
}

export function removeCanvasNode<T extends { id: string; links: Array<{ id: string }> }>(
  nodes: readonly T[],
  id: string,
): T[] | null {
  if (!nodes.some((node) => node.id === id)) return null;
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      links: node.links.filter((link) => link.id !== id),
    }));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

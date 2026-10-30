export type CanvasLink = { key: string; id: string; label: string; relation?: string };

export type CanvasDocument = {
  id: string;
  name: string;
  mediaType: string;
};

export type CanvasNode = {
  id: string;
  kind: string;
  title: string;
  body: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  url: string;
  notes: string[];
  links: CanvasLink[];
  locked?: boolean;
  achievementId?: string;
  document?: CanvasDocument;
  assets?: CanvasDocument[];
};

export type CanvasGroup = {
  id: string;
  name: string;
  members: string[];
  collapsed: boolean;
  x: number;
  y: number;
  event?: boolean;
};

export type CanvasBoard = {
  id: string;
  name: string;
  nodes: CanvasNode[];
  groups: CanvasGroup[];
};

export function readCanvasBoards(value: unknown): CanvasBoard[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const boards = value.flatMap((entry) => {
    const board = readBoard(entry);
    return board ? [board] : [];
  });
  return boards.length > 0 ? boards : null;
}

function readBoard(value: unknown): CanvasBoard | null {
  if (!value || typeof value !== "object") return null;
  const board = value as Partial<CanvasBoard>;
  if (typeof board.id !== "string" || !board.id) return null;
  const nodes = Array.isArray(board.nodes)
    ? board.nodes.flatMap((entry) => {
        const node = readNode(entry);
        return node ? [node] : [];
      })
    : [];
  const groups = Array.isArray(board.groups)
    ? board.groups.flatMap((entry) => {
        const group = readGroup(entry);
        return group ? [group] : [];
      })
    : [];
  return releasePointingMembers({
    id: board.id,
    name: typeof board.name === "string" && board.name ? board.name : board.id,
    nodes,
    groups,
  });
}

function readNode(value: unknown): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Partial<CanvasNode>;
  if (typeof node.id !== "string" || !node.id || typeof node.title !== "string") return null;
  const x = Number(node.x);
  const y = Number(node.y);
  return {
    id: node.id,
    kind: typeof node.kind === "string" ? node.kind : "Design",
    title: node.title,
    body: typeof node.body === "string" ? node.body : "",
    x: Number.isFinite(x) ? x : 24,
    y: Number.isFinite(y) ? y : 48,
    w: typeof node.w === "number" ? node.w : undefined,
    h: typeof node.h === "number" ? node.h : undefined,
    url: typeof node.url === "string" ? node.url : "",
    notes: Array.isArray(node.notes) ? node.notes.filter((note): note is string => typeof note === "string") : [],
    links: Array.isArray(node.links)
      ? node.links.flatMap((entry) => {
          const link = readLink(entry);
          return link ? [link] : [];
        })
      : [],
    locked: node.locked === true ? true : undefined,
    achievementId: typeof node.achievementId === "string" && node.achievementId ? node.achievementId : undefined,
    ...(readDocument(node.document) ? { document: readDocument(node.document) } : {}),
    ...(readAssets(node.assets).length ? { assets: readAssets(node.assets) } : {}),
  };
}

function readAssets(value: unknown): CanvasDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const asset = readDocument(entry);
    return asset ? [asset] : [];
  });
}

function readDocument(value: unknown): CanvasDocument | undefined {
  if (!value || typeof value !== "object") return undefined;
  const document = value as Partial<CanvasDocument>;
  if (typeof document.id !== "string" || !document.id) return undefined;
  if (typeof document.name !== "string" || !document.name) return undefined;
  return {
    id: document.id,
    name: document.name,
    mediaType: typeof document.mediaType === "string" ? document.mediaType : "",
  };
}

function readLink(value: unknown): CanvasLink | null {
  if (!value || typeof value !== "object") return null;
  const link = value as Partial<CanvasLink>;
  if (typeof link.id !== "string" || !link.id) return null;
  return {
    key: typeof link.key === "string" ? link.key : link.id,
    id: link.id,
    label: typeof link.label === "string" ? link.label : "",
    relation: typeof link.relation === "string" ? link.relation : undefined,
  };
}

function readGroup(value: unknown): CanvasGroup | null {
  if (!value || typeof value !== "object") return null;
  const group = value as Partial<CanvasGroup>;
  if (typeof group.id !== "string" || !group.id) return null;
  const x = Number(group.x);
  const y = Number(group.y);
  return {
    id: group.id,
    name: typeof group.name === "string" ? group.name : "Group",
    members: Array.isArray(group.members)
      ? group.members.filter((id): id is string => typeof id === "string")
      : [],
    collapsed: group.collapsed === true,
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    ...(group.event === true ? { event: true } : {}),
  };
}

export function pointsAtGroup(node: { links: { id: string }[] } | undefined, groupId: string) {
  return Boolean(node?.links.some((link) => link.id === groupId));
}

export function releasePointingMembers(board: CanvasBoard): CanvasBoard {
  let changed = false;
  const groups = board.groups.flatMap((group) => {
    const members = group.members.filter((id) => {
      const pointing = pointsAtGroup(
        board.nodes.find((node) => node.id === id),
        group.id,
      );
      if (pointing) changed = true;
      return !pointing;
    });
    if (members.length === group.members.length) return [group];
    changed = true;
    if (members.length < 2) return [];
    const cards = board.nodes.filter((node) => members.includes(node.id));
    return [{
      ...group,
      members,
      x: cards.length ? Math.min(...cards.map((card) => card.x)) : group.x,
      y: cards.length ? Math.min(...cards.map((card) => card.y)) : group.y,
    }];
  });
  const removed = new Set(
    board.groups.filter((group) => !groups.some((item) => item.id === group.id)).map((group) => group.id),
  );
  const nodes = removed.size
    ? board.nodes.map((node) =>
        node.links.some((link) => removed.has(link.id))
          ? { ...node, links: node.links.filter((link) => !removed.has(link.id)) }
          : node,
      )
    : board.nodes;
  if (!changed && removed.size === 0) return board;
  return { ...board, nodes, groups };
}

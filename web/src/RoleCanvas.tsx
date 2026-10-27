import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { WorkMapRole } from "@core/work-map";
import "./role-canvas.css";

type CanvasLink = { key: string; id: string; label: string };
type CanvasNode = {
  id: string;
  kind: string;
  title: string;
  body: string;
  x: number;
  y: number;
  url: string;
  notes: string[];
  links: CanvasLink[];
};
type CanvasBoard = { id: string; name: string; nodes: CanvasNode[] };

export function boardsForRole(role: WorkMapRole): CanvasBoard[] {
  return [
    {
      id: role.id,
      name: role.title || role.organization || "This role",
      nodes: [
        {
          id: "role",
          kind: "Role",
          title: role.title || "Untitled",
          body: role.description,
          x: 24,
          y: 48,
          url: "",
          notes: [],
          links: [],
        },
      ],
    },
  ];
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

export function RoleCanvasEntry({ role }: { role: WorkMapRole }) {
  const seeded = useMemo(() => boardsForRole(role), [role]);
  const [boards, setBoards] = useState(seeded);
  const [canvasId, setCanvasId] = useState(seeded[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [allOpen, setAllOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [note, setNote] = useState("");
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const restoreFrame = useRef<Frame | null>(null);

  useEffect(() => {
    if (!allOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".role-canvas-menu, .role-canvas-all")) return;
      setAllOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [allOpen]);

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
    setBoards(seeded);
    setCanvasId(seeded[0]?.id ?? "");
    setSelectedId(null);
    setOpen(false);
    setViewer(null);
  }, [seeded]);

  const canvas = boards.find((board) => board.id === canvasId) ?? boards[0];
  const selected = canvas?.nodes.find((node) => node.id === selectedId) ?? null;
  const linked = (canvas?.nodes.filter((node) => node.id !== "role" && node.kind !== "Achievement") ?? []);

  function patchNode(id: string, patch: Partial<CanvasNode>) {
    setBoards((current) =>
      current.map((board) => ({
        ...board,
        nodes: board.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      })),
    );
  }

  function showHome(nextId: string) {
    setCanvasId(nextId);
    setSelectedId(null);
    setLinkOpen(false);
    setAllOpen(false);
    setPanelPos(null);
  }

  function openCanvas(nodeId: string | null) {
    setOpen(true);
    setMinimized(false);
    setSelectedId(nodeId);
    setLinkOpen(false);
    setPanelPos(null);
  }

  function closeCanvas() {
    setOpen(false);
    setSelectedId(null);
    setMinimized(false);
    setMaximized(false);
    setAllOpen(false);
    setLinkOpen(false);
  }

  function openViewer(node: CanvasNode) {
    if (!node.url) return;
    setViewer({ title: node.title, url: node.url, kind: node.kind });
  }

  function onLinked(node: CanvasNode) {
    if (node.kind === "Video" || node.kind === "Photo") {
      openViewer(node);
      return;
    }
    openCanvas(node.id);
  }

  useLayoutEffect(() => {
    const plane = planeRef.current;
    if (!plane) return;
    plane.style.transform = `scale(${zoom})`;
    plane.style.marginRight = `${plane.offsetWidth * (zoom - 1)}px`;
    plane.style.marginBottom = `${plane.offsetHeight * (zoom - 1)}px`;
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

  function dragWindow(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || maximized) return;
    if ((event.target as HTMLElement).closest("button")) return;
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
    const current = readFrame();
    if (!minimized) {
      restoreFrame.current = current;
      setFrame(current);
      setMinimized(true);
      setMaximized(false);
      return;
    }
    setMinimized(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  function toggleMaximize() {
    const current = readFrame();
    if (!maximized) {
      restoreFrame.current = current;
      setFrame(mapFrame());
      setMaximized(true);
      setMinimized(false);
      return;
    }
    setMaximized(false);
    if (restoreFrame.current) setFrame(restoreFrame.current);
  }

  function dragNode(event: ReactPointerEvent<HTMLElement>, node: CanvasNode) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, input, textarea")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = node.x;
    const originY = node.y;
    let moved = false;
    const card = event.currentTarget;
    try {
      card.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional */
    }
    function move(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      const dx = next.clientX - startX;
      const dy = next.clientY - startY;
      if (!moved && dx * dx + dy * dy < 16) return;
      moved = true;
      patchNode(node.id, {
        x: Math.max(8, originX + dx / zoom),
        y: Math.max(8, originY + dy / zoom),
      });
    }
    function up(next: PointerEvent) {
      if (next.pointerId !== event.pointerId) return;
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerup", up);
      if (!moved) {
        setSelectedId(node.id);
        setLinkOpen(false);
      }
    }
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerup", up);
  }

  function fit() {
    const stage = stageRef.current;
    if (!stage || !canvas || canvas.nodes.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = 0;
    let maxY = 0;
    for (const node of canvas.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + 220);
      maxY = Math.max(maxY, node.y + 96);
    }
    const pad = 28;
    const next = Math.min(
      2.5,
      Math.max(
        0.35,
        Math.min(
          stage.clientWidth / Math.max(1, maxX - minX + pad * 2),
          stage.clientHeight / Math.max(1, maxY - minY + pad * 2),
        ),
      ),
    );
    setZoom(next);
    stage.scrollLeft = Math.max(0, minX * next - pad);
    stage.scrollTop = Math.max(0, minY * next - pad);
  }

  function duplicate() {
    const source = selected ?? canvas?.nodes[0];
    if (!source || !canvas) return;
    const copy: CanvasNode = {
      id: `copy-${Date.now()}`,
      kind: source.kind,
      title: source.title,
      body: source.body,
      x: source.x + 36,
      y: source.y + 36,
      url: source.url,
      notes: [],
      links: source.links.map((link) => ({ ...link })),
    };
    setBoards((current) =>
      current.map((board) =>
        board.id === canvas.id ? { ...board, nodes: [...board.nodes, copy] } : board,
      ),
    );
    setSelectedId(copy.id);
  }

  function jumpSearch() {
    const needle = query.trim().toLowerCase();
    const match = canvas?.nodes.find(
      (node) => !needle || `${node.title} ${node.body}`.toLowerCase().includes(needle),
    );
    if (!match || !stageRef.current) return;
    stageRef.current.scrollLeft = Math.max(0, match.x * zoom - 24);
    stageRef.current.scrollTop = Math.max(0, match.y * zoom - 24);
    setSelectedId(match.id);
  }

  function addLink(target: CanvasNode) {
    if (!selected) return;
    const key = target.id;
    const already = selected.links.some((link) => link.key === key);
    if (!already) {
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
    if (!selected || selected.kind !== "Role") return;
    const text = note.trim();
    if (!text) return;
    patchNode(selected.id, { notes: [...selected.notes, text] });
    setNote("");
  }

  const geometry = frame
    ? {
        left: frame.left,
        top: frame.top,
        ...(minimized ? {} : { width: frame.width, height: frame.height }),
      }
    : undefined;

  const windowNode = open ? (
    <div
      className={[
        "role-canvas",
        minimized ? "is-minimized" : "",
        maximized ? "is-maximized" : "",
        selected ? "is-focus" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={windowRef}
      role="dialog"
      aria-label="Canvas"
      style={geometry}
    >
      {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
        <div
          key={edge}
          className={`resize ${edge}`}
          title="Drag to resize"
          onPointerDown={(event) => resizeWindow(event, edge)}
        />
      ))}
      <div className="role-canvas-bar" onPointerDown={dragWindow}>
        <h2>Canvas</h2>
        <div className="role-canvas-actions">
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
      {selected ? (
        <section
          className="role-canvas-controls"
          aria-label={`${selected.kind} ${selected.title}`}
          style={panelPos ?? undefined}
        >
          <div
            className="role-canvas-controls-head"
            onPointerDown={(event) => {
              if (event.button !== 0 || (event.target as HTMLElement).closest("button, input, textarea")) return;
              const panel = event.currentTarget.parentElement;
              if (!panel) return;
              const box = panel;
              const originLeft = box.offsetLeft;
              const originTop = box.offsetTop;
              const startX = event.clientX;
              const startY = event.clientY;
              const head = event.currentTarget;
              function move(next: PointerEvent) {
                if (next.pointerId !== event.pointerId) return;
                const host = windowRef.current;
                const maxLeft = Math.max(8, (host?.clientWidth ?? 320) - box.offsetWidth - 8);
                const maxTop = Math.max(40, (host?.clientHeight ?? 240) - 80);
                setPanelPos({
                  left: Math.min(Math.max(8, originLeft + next.clientX - startX), maxLeft),
                  top: Math.min(Math.max(40, originTop + next.clientY - startY), maxTop),
                });
              }
              function up(next: PointerEvent) {
                if (next.pointerId !== event.pointerId) return;
                head.removeEventListener("pointermove", move);
                head.removeEventListener("pointerup", up);
              }
              head.addEventListener("pointermove", move);
              head.addEventListener("pointerup", up);
            }}
          >
            <p>
              {selected.kind} · {selected.title}
            </p>
            <button type="button" onClick={() => setSelectedId(null)}>
              Done
            </button>
          </div>
          <label>
            Title
            <input
              aria-label="Title"
              value={selected.title}
              onChange={(event) => patchNode(selected.id, { title: event.target.value })}
            />
          </label>
          <label>
            Description
            <textarea
              aria-label="Description"
              value={selected.body}
              onChange={(event) => patchNode(selected.id, { body: event.target.value })}
            />
          </label>
          <div className="role-canvas-control-row">
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
                        <button key={node.id} type="button" role="menuitem" onClick={() => addLink(node)}>
                          {linkedTo ? `Open ${node.title || node.kind}` : node.title || node.kind}
                        </button>
                      );
                    })}
                  {canvas.nodes.length < 2 ? <p>Nothing else on this canvas yet.</p> : null}
                </div>
              ) : null}
            </div>
            {selected.kind === "Role" ? (
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
            {selected.url && (selected.kind === "Video" || selected.kind === "Photo") ? (
              <button type="button" onClick={() => openViewer(selected)}>
                {selected.kind === "Video" ? "Play" : "Open"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      <div
        className="role-canvas-stage"
        ref={stageRef}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget && event.target !== planeRef.current) return;
          setSelectedId(null);
          setLinkOpen(false);
        }}
      >
        <div className="role-canvas-plane" ref={planeRef}>
          <svg className="role-canvas-wires" aria-hidden="true">
            {wires.map((wire) => (
              <path key={wire.id} d={wire.d} className={wire.live ? "is-live" : undefined} />
            ))}
          </svg>
          {canvas?.nodes.map((node) => {
            const faded =
              query.trim() &&
              !`${node.title} ${node.body} ${node.kind}`.toLowerCase().includes(query.trim().toLowerCase());
            return (
              <article
                key={node.id}
                className={["role-canvas-node", node.id === selectedId ? "is-selected" : "", faded ? "is-filtered" : ""]
                  .filter(Boolean)
                  .join(" ")}
                data-id={node.id}
                style={{ left: node.x, top: node.y }}
                onPointerDown={(event) => dragNode(event, node)}
              >
                <p className="kind">{node.kind}</p>
                <h3>{node.title || "Untitled"}</h3>
                {node.body ? <p>{node.body}</p> : null}
                {node.notes.length > 0 ? <p>{node.notes.join(" ")}</p> : null}
                {node.links.length > 0 ? (
                  <p className="links">Links out to {node.links.map((link) => link.label).join(", ")}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
      <div className={allOpen ? "role-canvas-drawer is-open" : "role-canvas-drawer"}>
        {allOpen ? (
          <div className="role-canvas-menu" role="menu">
            {boards.map((board) => (
              <button key={board.id} type="button" role="menuitem" onClick={() => showHome(board.id)}>
                {board.name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="role-canvas-tools" role="toolbar" aria-label="Canvas">
          <input
            aria-label="Search nodes"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                jumpSearch();
              }
            }}
          />
          <button type="button" onClick={() => setZoom((value) => clampZoom(value / 1.2))}>
            Out
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => clampZoom(value * 1.2))}>
            In
          </button>
          <button type="button" onClick={fit}>
            Fit
          </button>
          <button type="button" onClick={duplicate}>
            Duplicate
          </button>
          <div className="role-canvas-tabs" role="tablist" aria-label="Canvases">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                role="tab"
                aria-selected={board.id === canvas?.id}
                title={board.name}
                onClick={() => showHome(board.id)}
              >
                {board.name}
              </button>
            ))}
          </div>
          <button
            className="role-canvas-all"
            type="button"
            aria-expanded={allOpen}
            aria-haspopup="menu"
            onClick={() => setAllOpen((value) => !value)}
          >
            All
            <CaretIcon />
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="role-canvas-entry">
      {linked.length > 0 ? (
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
      ) : null}
      <button
        className="job-more-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => (open ? closeCanvas() : openCanvas(null))}
      >
        Show on canvas
      </button>
      {windowNode ? createPortal(windowNode, document.body) : null}
      {viewer
        ? createPortal(
            <div className="role-canvas-viewer" role="dialog" aria-label={viewer.title}>
              <header>
                <div>
                  <h2>{viewer.title}</h2>
                  <p>{viewer.kind}</p>
                </div>
                <button type="button" onClick={() => setViewer(null)}>
                  Close
                </button>
              </header>
              {viewer.kind === "Video" ? (
                <video className="role-canvas-frame" controls src={viewer.url} />
              ) : (
                <img className="role-canvas-frame" alt="" src={viewer.url} />
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function clampZoom(value: number) {
  return Math.min(2.5, Math.max(0.35, value));
}

function useWires(canvas: CanvasBoard | undefined, active: boolean, zoom: number, selectedId: string | null) {
  const [wires, setWires] = useState<Array<{ id: string; d: string; live: boolean }>>([]);
  useLayoutEffect(() => {
    if (!active || !canvas) {
      setWires([]);
      return;
    }
    const next: Array<{ id: string; d: string; live: boolean }> = [];
    const pairs: Array<[string, string]> = canvas.nodes
      .filter((node) => node.id !== "role")
      .map((node) => ["role", node.id]);
    for (const node of canvas.nodes) {
      for (const link of node.links) {
        if (!canvas.nodes.some((item) => item.id === link.id)) continue;
        if (!pairs.some(([from, to]) => from === node.id && to === link.id)) pairs.push([node.id, link.id]);
      }
    }
    const root = document.querySelector(".role-canvas");
    for (const [fromId, toId] of pairs) {
      const fromNode = canvas.nodes.find((node) => node.id === fromId);
      const toNode = canvas.nodes.find((node) => node.id === toId);
      const fromEl = root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(fromId)}"]`);
      const toEl = root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(toId)}"]`);
      if (!fromNode || !toNode) continue;
      const fromWidth = fromEl?.offsetWidth || 220;
      const fromHeight = fromEl?.offsetHeight || 88;
      const toHeight = toEl?.offsetHeight || 88;
      const x1 = fromNode.x + fromWidth;
      const y1 = fromNode.y + fromHeight / 2;
      const x2 = toNode.x;
      const y2 = toNode.y + toHeight / 2;
      const bend = Math.max(40, (x2 - x1) / 2);
      next.push({
        id: `${fromId}-${toId}`,
        d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
        live: selectedId === fromId || selectedId === toId,
      });
    }
    setWires(next);
  }, [active, canvas, zoom, selectedId]);
  return wires;
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

function CaretIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 7.5 L6 4.2 L9.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, StickyNote, X, Loader2, Check, Flame, HelpCircle, Ban, Minus, Maximize2, GripHorizontal } from "lucide-react";

/**
 * RecruiterPanel — anonymous "save candidate" + private notes UI for the
 * IR viewer. Talks to /api/recruiter/saves and /api/recruiter/notes; the
 * server issues a long-lived `recruiter_id` cookie so saves persist across
 * IR visits without an account.
 *
 * Renders:
 *   • a floating Save toggle (top-right of map) and
 *   • a Notes button that opens a side drawer with a debounced autosave.
 */

interface Props {
  irSlug: string;
  candidateName?: string | null;
  candidateHeadline?: string | null;
}

const NOTE_AUTOSAVE_DELAY_MS = 800;

type RecruiterTag = "hot" | "maybe" | "no_go";
const TAG_OPTIONS: { value: RecruiterTag; label: string; Icon: React.ComponentType<{ className?: string }>; activeClass: string }[] = [
  { value: "hot",   label: "Hot",   Icon: Flame,       activeClass: "bg-red-500 text-white border-red-500" },
  { value: "maybe", label: "Maybe", Icon: HelpCircle,  activeClass: "bg-amber-500 text-white border-amber-500" },
  { value: "no_go", label: "No-go", Icon: Ban,         activeClass: "bg-gray-500 text-white border-gray-500" },
];

export default function RecruiterPanel({ irSlug, candidateName, candidateHeadline }: Props) {
  const [saved, setSaved] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [tag, setTag] = useState<RecruiterTag | null>(null);

  const [notesOpen, setNotesOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Drag position for the floating notes card. null = use default bottom-right anchor.
  const [notePos, setNotePos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Resize state. null = use default size from CSS.
  const [noteSize, setNoteSize] = useState<{ w: number; h: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Minimize state. When minimized, only the header is rendered.
  const [noteMinimized, setNoteMinimized] = useState(false);

  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const card = e.currentTarget.parentElement as HTMLElement | null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) return;
    const { startX, startY, startW, startH } = resizeRef.current;
    const w = Math.max(260, Math.min(window.innerWidth - 16, startW + (e.clientX - startX)));
    const h = Math.max(180, Math.min(window.innerHeight - 16, startH + (e.clientY - startY)));
    setNoteSize({ w, h });
  }

  function onResizeEnd(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    // Don't initiate drag from the close button or other interactive children.
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea")) return;
    const card = e.currentTarget.parentElement as HTMLElement | null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    // Seed position so the card switches from bottom/right anchoring to absolute x/y.
    setNotePos({ x: rect.left, y: rect.top });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { dx, dy } = dragRef.current;
    const card = e.currentTarget.parentElement as HTMLElement | null;
    const w = card?.offsetWidth ?? 340;
    const h = card?.offsetHeight ?? 240;
    const maxX = window.innerWidth - w;
    const maxY = window.innerHeight - h;
    const x = Math.max(0, Math.min(maxX, e.clientX - dx));
    const y = Math.max(0, Math.min(maxY, e.clientY - dy));
    setNotePos({ x, y });
  }

  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // Initial load: save status + note body
  useEffect(() => {
    if (!irSlug) return;
    let cancelled = false;
    void fetch(`/api/recruiter/saves?slug=${encodeURIComponent(irSlug)}`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((d: { saved?: boolean; tag?: RecruiterTag | null }) => {
        if (!cancelled) {
          setSaved(!!d.saved);
          setTag(d.tag ?? null);
        }
      })
      .catch(() => {});
    void fetch(`/api/recruiter/notes?slug=${encodeURIComponent(irSlug)}`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((d: { body?: string }) => {
        if (!cancelled) {
          setNoteBody(d.body ?? "");
          setNoteLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNoteLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [irSlug]);

  async function toggleSave() {
    if (savingToggle) return;
    setSavingToggle(true);
    try {
      if (saved) {
        await fetch(`/api/recruiter/saves?slug=${encodeURIComponent(irSlug)}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        setSaved(false);
        setTag(null);
      } else {
        await fetch(`/api/recruiter/saves`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            irSlug,
            candidateName: candidateName ?? null,
            candidateHeadline: candidateHeadline ?? null,
          }),
        });
        setSaved(true);
      }
    } finally {
      setSavingToggle(false);
    }
  }

  async function setTagValue(next: RecruiterTag | null) {
    // optimistic
    const prev = tag;
    setTag(next);
    try {
      const res = await fetch(`/api/recruiter/saves`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ irSlug, tag: next }),
      });
      if (!res.ok) setTag(prev);
    } catch {
      setTag(prev);
    }
  }

  // Listen for "add talking point" events fired from chips/items elsewhere on the page.
  // Appends a bulleted line to the note (deduped) and opens the panel briefly.
  useEffect(() => {
    function onAdd(ev: Event) {
      const detail = (ev as CustomEvent<{ label?: string; kind?: string }>).detail || {};
      const raw = (detail.label || "").trim();
      if (!raw) return;
      const kind = (detail.kind || "").trim();
      const line = kind ? `• [${kind}] ${raw}` : `• ${raw}`;
      setNoteBody((prev) => {
        // Dedupe: skip if the exact line already exists
        const lines = prev.split("\n").map((l) => l.trim());
        if (lines.includes(line.trim())) return prev;
        // Header on first add
        const needsHeader = prev.trim().length === 0;
        const header = needsHeader ? "Talking points:\n" : "";
        const sep = !prev.endsWith("\n") && prev.length > 0 ? "\n" : "";
        return `${prev}${sep}${header}${line}`;
      });
      setNotesOpen(true);
      setNoteMinimized(false);
    }
    window.addEventListener("recruiter:add-talking-point", onAdd as EventListener);
    return () => window.removeEventListener("recruiter:add-talking-point", onAdd as EventListener);
  }, []);

  // Debounced autosave for note body
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!noteLoaded) return;
    if (noteBody === lastSavedRef.current) return;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    setNoteStatus("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await fetch(`/api/recruiter/notes`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ irSlug, body: noteBody }),
        });
        lastSavedRef.current = noteBody;
        setNoteStatus("saved");
        window.setTimeout(() => {
          setNoteStatus((s) => (s === "saved" ? "idle" : s));
        }, 1500);
      } catch {
        setNoteStatus("idle");
      }
    }, NOTE_AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [noteBody, noteLoaded, irSlug]);

  return (
    <>
      <div className="flex items-center gap-1" role="group" aria-label="Recruiter actions">
        {/* Save toggle */}
        <button
          type="button"
          onClick={toggleSave}
          disabled={savingToggle}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved candidates" : "Save candidate"}
          title={saved ? "Saved — click to remove" : "Save candidate"}
          className={`h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center border transition-colors ${
            saved
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : "bg-background text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {savingToggle ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
        </button>

        {/* Tag chips (only when saved) */}
        {saved && (
          <div className="flex items-center gap-0.5 ml-0.5" role="group" aria-label="Candidate tag">
            {TAG_OPTIONS.map((opt) => {
              const active = tag === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTagValue(active ? null : opt.value)}
                  aria-pressed={active}
                  title={opt.label}
                  className={`h-7 w-7 shrink-0 rounded-md border inline-flex items-center justify-center transition-colors ${
                    active ? opt.activeClass : "border-transparent text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <opt.Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        )}

        {/* Notes button */}
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          aria-label="Open private notes"
          title="Private notes"
          className="relative h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center border bg-background text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <StickyNote className="h-3.5 w-3.5" />
          {noteBody.trim().length > 0 && (
            <span className="absolute top-1 right-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </button>
      </div>

      {notesOpen && typeof document !== "undefined" && createPortal(
        <aside
          role="dialog"
          aria-label="Private recruiter notes"
          style={{
            ...(notePos
              ? { left: notePos.x, top: notePos.y, right: "auto", bottom: "auto" }
              : undefined),
            ...(noteSize && !noteMinimized
              ? { width: noteSize.w, height: noteSize.h, maxHeight: "none" }
              : undefined),
          }}
          className={`fixed bottom-24 right-4 z-[101] w-[340px] max-w-[calc(100vw-32px)] ${
            noteMinimized ? "" : "max-h-[60vh]"
          } bg-background border rounded-xl shadow-2xl flex flex-col pointer-events-auto`}
        >
          <div
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            className="flex items-center justify-between border-b px-3 py-2 cursor-grab active:cursor-grabbing select-none touch-none"
          >
            <div className="min-w-0 flex items-center gap-1.5">
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <StickyNote className="h-4 w-4 text-amber-500 shrink-0" /> Private notes
                </h3>
                {!noteMinimized && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Drag to move · only on this device.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setNoteMinimized((v) => !v)}
                aria-label={noteMinimized ? "Restore notes" : "Minimize notes"}
                title={noteMinimized ? "Restore" : "Minimize"}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
              >
                {noteMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                aria-label="Close notes"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {!noteMinimized && (
            <>
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b flex items-center gap-1.5 min-h-[22px]">
            {noteStatus === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </>
            )}
            {noteStatus === "saved" && (
              <>
                <Check className="h-3 w-3 text-emerald-500" /> Saved
              </>
            )}
          </div>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            disabled={!noteLoaded}
            placeholder={
              candidateName
                ? `Notes on ${candidateName}…`
                : "Notes on this candidate…"
            }
            className="flex-1 min-h-[160px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed focus:outline-none"
            maxLength={8000}
          />
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t flex justify-between">
            <span>{noteBody.length} / 8000</span>
            <a
              href="/recruiter-saved"
              className="text-primary hover:underline"
            >
              View all →
            </a>
          </div>
          {/* Resize handle */}
          <div
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            role="separator"
            aria-label="Resize notes"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none"
            style={{
              backgroundImage:
                "linear-gradient(135deg, transparent 0 50%, currentColor 50% 60%, transparent 60% 70%, currentColor 70% 80%, transparent 80%)",
              color: "rgb(148 163 184 / 0.6)",
            }}
          />
            </>
          )}
        </aside>,
        document.body,
      )}
    </>
  );
}

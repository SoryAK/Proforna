"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, StickyNote, X, Loader2, Check, Flame, HelpCircle, Ban } from "lucide-react";

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

      {notesOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setNotesOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Private recruiter notes"
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[380px] bg-background border-l shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <StickyNote className="h-4 w-4 text-amber-500" /> Private notes
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Visible only to you on this device.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                aria-label="Close notes"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-2 text-[11px] text-muted-foreground border-b flex items-center gap-1.5 min-h-[24px]">
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
              className="flex-1 w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed focus:outline-none"
              maxLength={8000}
            />
            <div className="px-4 py-2 text-[10px] text-muted-foreground border-t flex justify-between">
              <span>{noteBody.length} / 8000</span>
              <a
                href="/recruiter-saved"
                className="text-primary hover:underline"
              >
                View all saved candidates →
              </a>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

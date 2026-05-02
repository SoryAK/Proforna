"use client";
/**
 * CommentsThread — comment list + composer for a single annotation.
 * Wired into AnnotationEditor side panel.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2, Pencil, Check, X, Loader2 } from "lucide-react";

type Comment = {
  id: string;
  annotationId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  annotationId: string;
  /** Current viewer's user id, used to gate edit/delete actions. */
  currentUserId?: string | null;
};

function timeAgo(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CommentsThread({ annotationId, currentUserId }: Props) {
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gallery/annotations/comments?annotationId=${encodeURIComponent(annotationId)}`);
      if (!res.ok) throw new Error(await res.text());
      setItems(await res.json());
    } catch (e) {
      toast.error(`Failed to load comments: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [annotationId]);

  useEffect(() => { reload(); }, [reload]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/gallery/annotations/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotationId, body: text }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as Comment;
      setItems((arr) => [...arr, created]);
      setDraft("");
    } catch (e) {
      toast.error(`Failed to post comment: ${String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const prev = items;
    setItems((arr) => arr.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/gallery/annotations/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      toast.error(`Delete failed: ${String(e)}`);
      setItems(prev);
    }
  };

  const saveEdit = async (id: string) => {
    const text = editDraft.trim();
    if (!text) return;
    const prev = items;
    setItems((arr) => arr.map((c) => (c.id === id ? { ...c, body: text } : c)));
    setEditingId(null);
    try {
      const res = await fetch("/api/gallery/annotations/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, body: text }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      toast.error(`Edit failed: ${String(e)}`);
      setItems(prev);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Comments {items.length > 0 && `(${items.length})`}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((c) => {
            const mine = currentUserId && c.authorId === currentUserId;
            const isEditing = editingId === c.id;
            return (
              <li key={c.id} className="rounded-md border bg-muted/30 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(c.createdAt)}
                    {c.updatedAt !== c.createdAt && " · edited"}
                  </span>
                  {mine && !isEditing && (
                    <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                      <button
                        title="Edit"
                        onClick={() => { setEditingId(c.id); setEditDraft(c.body); }}
                        className="p-0.5 hover:bg-background rounded"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => remove(c.id)}
                        className="p-0.5 hover:bg-background rounded text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="space-y-1">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      maxLength={5000}
                      className="w-full px-2 py-1 text-xs rounded border bg-background resize-none"
                      autoFocus
                    />
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 text-[10px] rounded hover:bg-muted"
                      >
                        <X className="h-3 w-3 inline" /> Cancel
                      </button>
                      <button
                        onClick={() => saveEdit(c.id)}
                        className="px-2 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:opacity-90"
                      >
                        <Check className="h-3 w-3 inline" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs whitespace-pre-wrap break-words">{c.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void submit(); }
          }}
          placeholder="Add a comment… (Ctrl+Enter to send)"
          rows={2}
          maxLength={5000}
          className="flex-1 px-2 py-1.5 text-xs rounded-md border bg-background resize-none"
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || submitting}
          className="px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Post"}
        </button>
      </div>
    </div>
  );
}

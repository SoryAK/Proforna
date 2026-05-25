/**
 * WorklogNoteView — read-only ProseMirror JSON renderer.
 *
 * Phase 2c: the right pane defaults to this lightweight renderer so we do
 * NOT mount Tiptap or rehydrate Y.js just to display a note. The full
 * `<WorklogEditor>` mounts only when the user clicks the Edit button.
 *
 * This is a hand-rolled walker over the ProseMirror JSON tree — no Tiptap,
 * no schema, no Y.js. That sidesteps any rehydrate / schema-mismatch
 * issues for old notes and makes open-time effectively zero cost.
 *
 * Supported nodes (matches the editor's extension set):
 *   doc, paragraph, heading, blockquote, codeBlock, horizontalRule,
 *   bulletList, orderedList, taskList (+ listItem / taskItem),
 *   hardBreak, text, photo, shiftBlock, moodBlock, tag.
 * Supported marks: bold, italic, code, link, strike, underline.
 *
 * Anything unknown is rendered as its plain inline text (best effort) so
 * we never crash on legacy or future node types.
 */

"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

// Inline shift-window formatter (matches prosemirror-to-text.ts). Kept local
// to avoid pulling another module into the read-mode render path.
function formatShiftWindow(start: number | null, end: number | null): string {
  if (start == null || end == null) return "";
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, "0");
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = ((h + 11) % 12) + 1;
    return `${hour12}:${mm} ${period}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

interface PmMark {
  type: string;
  attrs?: Record<string, unknown> | null;
}

interface PmNode {
  type: string;
  text?: string;
  marks?: PmMark[];
  attrs?: Record<string, unknown> | null;
  content?: PmNode[];
}

export interface WorklogNoteViewProps {
  /** ProseMirror JSON document. */
  json?: unknown | null;
  /** Plain-text fallback for legacy notes that never had `contentJson`. */
  contentText?: string | null;
  className?: string;
}

export function WorklogNoteView({ json, contentText, className }: WorklogNoteViewProps) {
  const root = isPmDoc(json) ? (json as PmNode) : null;

  if (!root || !root.content || root.content.length === 0) {
    if (contentText && contentText.trim().length > 0) {
      return (
        <pre
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-sans leading-relaxed",
            className,
          )}
        >
          {contentText}
        </pre>
      );
    }
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        No content yet. Click <span className="font-medium">Edit</span> to start writing.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none leading-relaxed",
        className,
      )}
    >
      {root.content.map((node, i) => (
        <RenderBlock key={i} node={node} />
      ))}
    </div>
  );
}

function isPmDoc(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "doc" &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Block rendering
// ────────────────────────────────────────────────────────────────────────────

function RenderBlock({ node }: { node: PmNode }) {
  switch (node.type) {
    case "paragraph": {
      const inline = node.content ?? [];
      if (inline.length === 0) return <p>&nbsp;</p>;
      return (
        <p>
          <RenderInline nodes={inline} />
        </p>
      );
    }

    case "heading": {
      const level = clampHeading((node.attrs as { level?: number } | null)?.level);
      const inline = node.content ?? [];
      const children = <RenderInline nodes={inline} />;
      switch (level) {
        case 1: return <h1>{children}</h1>;
        case 2: return <h2>{children}</h2>;
        case 3: return <h3>{children}</h3>;
        case 4: return <h4>{children}</h4>;
        case 5: return <h5>{children}</h5>;
        default: return <h6>{children}</h6>;
      }
    }

    case "blockquote":
      return (
        <blockquote>
          {(node.content ?? []).map((c, i) => (
            <RenderBlock key={i} node={c} />
          ))}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre>
          <code>
            <RenderInline nodes={node.content ?? []} />
          </code>
        </pre>
      );

    case "horizontalRule":
      return <hr />;

    case "bulletList":
      return (
        <ul>
          {(node.content ?? []).map((item, i) => (
            <li key={i}>
              {(item.content ?? []).map((c, j) => (
                <RenderBlock key={j} node={c} />
              ))}
            </li>
          ))}
        </ul>
      );

    case "orderedList": {
      const start = (node.attrs as { start?: number } | null)?.start ?? 1;
      return (
        <ol start={start}>
          {(node.content ?? []).map((item, i) => (
            <li key={i}>
              {(item.content ?? []).map((c, j) => (
                <RenderBlock key={j} node={c} />
              ))}
            </li>
          ))}
        </ol>
      );
    }

    case "taskList":
      return (
        <ul className="list-none pl-0 space-y-1">
          {(node.content ?? []).map((item, i) => {
            const checked = (item.attrs as { checked?: boolean } | null)?.checked === true;
            return (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mt-1.5 h-3.5 w-3.5 cursor-not-allowed"
                />
                <div className={cn("flex-1", checked && "line-through text-muted-foreground")}>
                  {(item.content ?? []).map((c, j) => (
                    <RenderBlock key={j} node={c} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      );

    case "photo": {
      const a = (node.attrs ?? {}) as Record<string, unknown>;
      const src = typeof a.src === "string" ? a.src : "";
      const alt = typeof a.alt === "string" ? a.alt : "";
      const width = typeof a.width === "number" ? a.width : null;
      const height = typeof a.height === "number" ? a.height : null;
      const caption = typeof a.caption === "string" && a.caption ? a.caption : null;
      if (!src) return null;
      return (
        <figure className="my-3">
          {width && height ? (
            // unoptimized: avoids Turbopack's /uploads/* image loader bug
            <Image
              src={src}
              alt={alt || caption || "photo"}
              width={width}
              height={height}
              unoptimized
              className="max-w-full h-auto rounded-md border border-border"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt || caption || "photo"}
              className="max-w-full h-auto rounded-md border border-border"
            />
          )}
          {caption && (
            <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>
          )}
        </figure>
      );
    }

    case "shiftBlock": {
      const a = (node.attrs ?? {}) as Record<string, unknown>;
      const label = typeof a.label === "string" ? a.label : "Shift";
      const window = formatShiftWindow(
        typeof a.startMinute === "number" ? a.startMinute : null,
        typeof a.endMinute === "number" ? a.endMinute : null,
      );
      return (
        <p>
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
            {label}{window ? ` · ${window}` : ""}
          </span>
        </p>
      );
    }

    case "moodBlock": {
      const v = (node.attrs as { value?: string } | null)?.value ?? "neutral";
      const label = v === "good" ? "Good" : v === "tough" ? "Tough" : "OK";
      return (
        <p>
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
            Mood · {label}
          </span>
        </p>
      );
    }

    case "canvasBlock": {
      const a = (node.attrs ?? {}) as Record<string, unknown>;
      const title = typeof a.title === "string" && a.title ? a.title : "Canvas";
      return (
        <figure className="my-3 rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
          </div>
          <div className="flex items-center justify-center h-16 bg-muted/10">
            <span className="text-xs text-muted-foreground">Canvas — open note to view</span>
          </div>
        </figure>
      );
    }

    default:
      // Unknown block: render inline children if any, else nothing.
      if (Array.isArray(node.content) && node.content.length > 0) {
        return (
          <p>
            <RenderInline nodes={node.content} />
          </p>
        );
      }
      return null;
  }
}

function clampHeading(n: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  if (typeof n !== "number" || !Number.isFinite(n)) return 3;
  if (n < 1) return 1;
  if (n > 6) return 6;
  return n as 1 | 2 | 3 | 4 | 5 | 6;
}

// ────────────────────────────────────────────────────────────────────────────
// Inline rendering
// ────────────────────────────────────────────────────────────────────────────

function RenderInline({ nodes }: { nodes: PmNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (
        <RenderInlineNode key={i} node={n} />
      ))}
    </>
  );
}

function RenderInlineNode({ node }: { node: PmNode }) {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks);
    case "hardBreak":
      return <br />;
    case "tag": {
      const label = (node.attrs as { label?: string } | null)?.label ?? "";
      if (!label) return null;
      return (
        <span className="inline-flex items-center rounded bg-primary/10 text-primary px-1 py-0.5 text-xs font-medium">
          #{label}
        </span>
      );
    }
    case "shiftBlock":
    case "moodBlock":
      // These can appear inline in some legacy docs; defer to the block renderer.
      return <RenderBlock node={node} />;
    default:
      // Unknown inline: walk children if present.
      if (Array.isArray(node.content)) {
        return <RenderInline nodes={node.content} />;
      }
      return null;
  }
}

function applyMarks(text: string, marks: PmMark[] | undefined): React.ReactNode {
  if (!marks || marks.length === 0) return text;
  let node: React.ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
      case "strong":
        node = <strong>{node}</strong>;
        break;
      case "italic":
      case "em":
        node = <em>{node}</em>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "strike":
        node = <s>{node}</s>;
        break;
      case "underline":
        node = <u>{node}</u>;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? (mark.attrs.href as string) : "#";
        node = (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline underline-offset-2"
          >
            {node}
          </a>
        );
        break;
      }
      default:
        // Unknown mark: keep text unstyled.
        break;
    }
  }
  return node;
}

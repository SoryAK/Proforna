/**
 * PhotoNodeView — React-rendered NodeView for the `photo` Tiptap node.
 *
 * Responsibilities:
 *   • Render the image (unoptimized to sidestep Next 16 Turbopack's broken
 *     /uploads/* loader — see /memories/resumsify-lessons.md).
 *   • Inline caption input. Debounced PATCH mirrors the caption to the DB
 *     so SQL search stays consistent with the live node attr.
 *   • Selectable (Tiptap handles selection styling); deletable with Backspace
 *     when selected (default ProseMirror atom behaviour).
 *   • Drag handle is provided automatically by Tiptap because the parent
 *     node sets `draggable: true`.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { patchBodyPhotoCaption } from "@/lib/worklog/photo-upload";
import { cn } from "@/lib/utils";

const CAPTION_DEBOUNCE_MS = 600;

export function PhotoNodeView(props: NodeViewProps) {
  const { node, updateAttributes, editor, selected } = props;
  const attrs = node.attrs as {
    photoId: string;
    src: string;
    alt: string | null;
    width: number | null;
    height: number | null;
    caption: string | null;
  };

  const [caption, setCaption] = useState<string>(attrs.caption ?? "");
  const lastSyncedRef = useRef<string>(attrs.caption ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local state in sync if attrs are updated externally (e.g. collab).
  useEffect(() => {
    const next = attrs.caption ?? "";
    if (next !== caption && next !== lastSyncedRef.current) {
      setCaption(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrs.caption]);

  const editable = editor?.isEditable ?? true;

  const flushCaption = useCallback(
    (value: string) => {
      const normalized = value.trim().length === 0 ? null : value;
      updateAttributes({ caption: normalized });
      if (lastSyncedRef.current !== (normalized ?? "")) {
        lastSyncedRef.current = normalized ?? "";
        if (attrs.photoId) {
          void patchBodyPhotoCaption(attrs.photoId, normalized);
        }
      }
    },
    [attrs.photoId, updateAttributes],
  );

  function onCaptionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setCaption(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flushCaption(next), CAPTION_DEBOUNCE_MS);
  }

  function onCaptionBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    flushCaption(caption);
  }

  // Layout hint: only feed width/height to next/image when we have real
  // intrinsic dimensions; otherwise let the browser size it via max-width.
  const hasDims = !!(attrs.width && attrs.height);

  return (
    <NodeViewWrapper
      as="figure"
      data-photo-node="true"
      data-photo-id={attrs.photoId}
      className={cn(
        "worklog-photo my-3 max-w-full",
        selected && "ring-2 ring-primary rounded-sm",
      )}
    >
      <div className="relative inline-block max-w-full">
        {hasDims ? (
          <Image
            src={attrs.src}
            alt={attrs.alt ?? caption ?? "Worklog photo"}
            width={attrs.width!}
            height={attrs.height!}
            unoptimized
            className="rounded border max-w-full h-auto"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attrs.src}
            alt={attrs.alt ?? caption ?? "Worklog photo"}
            className="rounded border max-w-full h-auto"
          />
        )}
      </div>
      {editable ? (
        <input
          type="text"
          value={caption}
          onChange={onCaptionChange}
          onBlur={onCaptionBlur}
          placeholder="Add a caption…"
          className={cn(
            "block w-full mt-1 text-xs bg-transparent border-0 border-b border-transparent",
            "focus:border-border focus:outline-none px-0 py-0.5 text-muted-foreground",
          )}
        />
      ) : caption ? (
        <figcaption className="text-xs text-muted-foreground mt-1">{caption}</figcaption>
      ) : null}
    </NodeViewWrapper>
  );
}
